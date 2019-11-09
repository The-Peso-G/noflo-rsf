import noflo from 'noflo'
import {
  ContactableConfig,
  Contactable,
  Statement,
  Option,
  Reaction
} from 'rsf-types'
import { init as contactableInit, makeContactable, shutdown } from 'rsf-contactable'
import {
  DEFAULT_ALL_COMPLETED_TEXT,
  DEFAULT_INVALID_RESPONSE_TEXT,
  DEFAULT_MAX_RESPONSES_TEXT,
  DEFAULT_TIMEOUT_TEXT,
  rulesText,
  whichToInit,
  collectFromContactables,
  timer
} from '../libs/shared'

// define other constants or creator functions
// of the strings for user interaction here
const giveOptionsText = (options: Option[]) => {
  return `The options for each statement are: ${options.map(o => `${o.text} (${o.triggers.join(', ')})`).join(', ')}`
}

// use of this trigger will allow any response to match
const WILDCARD_TRIGGER = '*'

const defaultReactionCb = (reaction: Reaction) => { }

const coreLogic = async (
  contactables: Contactable[],
  statements: Statement[],
  options: Option[],
  maxTime: number,
  reactionCb: (reaction: Reaction) => void = defaultReactionCb,
  maxResponsesText: string = DEFAULT_MAX_RESPONSES_TEXT,
  allCompletedText: string = DEFAULT_ALL_COMPLETED_TEXT,
  timeoutText: string = DEFAULT_TIMEOUT_TEXT,
  invalidResponseText: string = DEFAULT_INVALID_RESPONSE_TEXT
) => {
  // initiate contact with each person
  // and set context, and "rules"
  contactables.forEach(async (contactable: Contactable) => {
    contactable.speak(rulesText(maxTime))
    await timer(500)
    contactable.speak(giveOptionsText(options))
    // send the first one
    if (statements.length) {
      await timer(500)
      contactable.speak(`(${statements.length - 1} remaining) ${statements[0].text}`)
    }
  })

  const matchOption = (text: string): Option => {
    return options.find(option => {
      return option.triggers.find(trigger => trigger === text || trigger === WILDCARD_TRIGGER)
    })
  }

  // for collectFromContactables
  const validate = (msg: string): boolean => {
    return !!matchOption(msg)
  }
  const onInvalid = (msg: string, contactable): void => {
    contactable.speak(invalidResponseText)
  }
  const isPersonalComplete = (personalResultsSoFar: Reaction[]): boolean => {
    return personalResultsSoFar.length === statements.length
  }
  const onPersonalComplete = (personalResultsSoFar: Reaction[], contactable: Contactable): void => {
    contactable.speak(maxResponsesText)
  }
  const convertToResult = (msg: string, personalResultsSoFar: Reaction[], contactable: any): Reaction => {
    const matchedOption = matchOption(msg)
    const responsesSoFar = personalResultsSoFar.length
    return {
      statement: { ...statements[responsesSoFar] }, // clone
      response: matchedOption.text,
      responseTrigger: msg,
      id: contactable.id,
      timestamp: Date.now()
    }
  }
  const onResult = (reaction: Reaction, personalResultsSoFar: Reaction[], contactable: Contactable): void => {
    // each time it gets one, send the next one
    // until they're all responded to!
    const responsesSoFar = personalResultsSoFar.length
    if (statements[responsesSoFar]) {
      const next = `(${statements.length - 1 - responsesSoFar} remaining) ${statements[responsesSoFar].text}`
      contactable.speak(next)
    }
    reactionCb(reaction)
  }
  const isTotalComplete = (allResultsSoFar: Reaction[]): boolean => {
    return allResultsSoFar.length === contactables.length * statements.length
  }

  const { timeoutComplete, results } = await collectFromContactables(
    contactables,
    maxTime,
    validate,
    onInvalid,
    isPersonalComplete,
    onPersonalComplete,
    convertToResult,
    onResult,
    isTotalComplete
  )
  await Promise.all(contactables.map(contactable => contactable.speak(timeoutComplete ? timeoutText : allCompletedText)))
  return results
}

const process = async (input, output) => {

  // Check preconditions on input data
  if (!input.hasData('options', 'statements', 'max_time', 'contactable_configs', 'bot_configs')) {
    return
  }

  // Read packets we need to process
  const maxTime: number = input.getData('max_time')
  const options: Option[] = input.getData('options')
  const statements: Statement[] = input.getData('statements').slice(0) // make sure that this array is its own
  const botConfigs = input.getData('bot_configs')
  const contactableConfigs: ContactableConfig[] = input.getData('contactable_configs')
  const invalidResponseText: string | undefined = input.getData('invalid_response_text')
  const maxResponsesText: string | undefined = input.getData('max_responses_text')
  const allCompletedText: string | undefined = input.getData('all_completed_text')
  const timeoutText: string | undefined = input.getData('timeout_text')

  let contactables: Contactable[]
  try {
    await contactableInit(whichToInit(contactableConfigs), botConfigs)
    contactables = contactableConfigs.map(makeContactable)
  } catch (e) {
    // Process data and send output
    output.send({
      error: e
    })
    // Deactivate
    output.done()
    return
  }

  try {
    const results = await coreLogic(
      contactables,
      statements,
      options,
      maxTime,
      (reaction: Reaction): void => {
        output.send({ reaction })
      },
      maxResponsesText,
      allCompletedText,
      timeoutText,
      invalidResponseText
    )
    // Process data and send output
    output.send({
      results
    })
  } catch (e) {
    output.send({
      error: e
    })
  }
  console.log('calling rsf-contactable shutdown from CollectResponses')
  await shutdown() // rsf-contactable
  // Deactivate
  output.done()
}

const getComponent = () => {
  const c = new noflo.Component()

  /* META */
  c.description = 'For a list/array of statements, collect a response or vote for each from a list of participants'
  c.icon = 'compress'

  /* IN PORTS */
  c.inPorts.add('options', {
    datatype: 'array',
    description: 'a list containing the options (as objects with properties "triggers": "array" and "text": "string") people have to respond with',
    required: true
  })
  c.inPorts.add('statements', {
    datatype: 'array',
    description: 'the list of statements (as objects with property "text") to gather responses to',
    required: true
  })
  c.inPorts.add('max_time', {
    datatype: 'int',
    description: 'the number of seconds to wait until stopping this process automatically',
    required: true
  })
  c.inPorts.add('contactable_configs', {
    datatype: 'array',
    description: 'an array of rsf-contactable compatible config objects',
    required: true
  })
  c.inPorts.add('bot_configs', {
    datatype: 'object',
    description: 'an object of rsf-contactable compatible bot config objects',
    required: true
  })
  c.inPorts.add('max_responses_text', {
    datatype: 'string',
    description: 'msg override: the message sent when participant hits response limit'
  })
  c.inPorts.add('invalid_response_text', {
    datatype: 'string',
    description: 'msg override: the message sent when participant use an invalid response'
  })
  c.inPorts.add('all_completed_text', {
    datatype: 'string',
    description: 'msg override: the message sent to all participants when the process completes, by completion by all participants'
  })
  c.inPorts.add('timeout_text', {
    datatype: 'string',
    description: 'msg override: the message sent to all participants when the process completes because the timeout is reached'
  })

  /* OUT PORTS */
  /*
      [Response], array of the responses collected
      Response.statement : Statement, the same as the Statement objects given
      Response.response : String, the text of the selected option
      Response.responseTrigger : String, the original text of the response
      Response.id : String, the id of the agent who gave the response
      Response.timestamp : Number, the unix timestamp of the moment the message was received
      */
  c.outPorts.add('reaction', {
    datatype: 'object'
  })
  c.outPorts.add('results', {
    datatype: 'array'
  })
  c.outPorts.add('error', {
    datatype: 'all'
  })

  /* DEFINE PROCESS */
  c.process(process)

  /* return */
  return c
}

export {
  coreLogic,
  getComponent
}