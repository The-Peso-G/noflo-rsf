import * as noflo from 'noflo'
import { init as contactableInit, makeContactable, shutdown as contactableShutdown } from 'rsf-contactable'
import {
  whichToInit,
  PairwiseResultFn,
  genericPairwise
} from '../libs/shared'
import { Contactable, Statement, ContactableConfig, PairwiseVote, PairwiseChoice, ContactableInitConfig, PairwiseQualified } from 'rsf-types'
import { ProcessHandler, NofloComponent } from '../libs/noflo-types'

const defaultPairwiseVoteCb = (pairwiseVote: PairwiseVote): void => { }

const coreLogic = async (
  contactables: Contactable[],
  statements: Statement[],
  choice: string,
  maxTime: number,
  eachCb: (pairwiseVote: PairwiseVote) => void = defaultPairwiseVoteCb,
  maxResponsesText: string,
  allCompletedText: string,
  timeoutText: string,
  invalidResponseText: string
): Promise<PairwiseVote[]> => {

  const validate = (text: string): boolean => {
    return text === '1' || text === '0'
  }
  const convertToPairwiseResult: PairwiseResultFn<PairwiseVote> = (
    msg: string,
    personalResultsSoFar: PairwiseVote[],
    contactable: Contactable,
    pairsTexts: PairwiseChoice[]
  ): PairwiseVote => {
    const responsesSoFar = personalResultsSoFar.length
    return {
      choices: pairsTexts[responsesSoFar],
      choice: parseInt(msg),
      contact: contactable.config(),
      timestamp: Date.now()
    }
  }
  
  return await genericPairwise<PairwiseVote>(
    contactables,
    statements,
    choice,
    maxTime,
    eachCb,
    validate,
    convertToPairwiseResult,
    maxResponsesText,
    allCompletedText,
    timeoutText,
    invalidResponseText
  )
}

const process: ProcessHandler = async (input, output) => {

  if (!input.hasData('choice', 'statements', 'max_time', 'contactable_configs', 'bot_configs')) {
    return
  }

  const choice: string = input.getData('choice')
  const statements: Statement[] = input.getData('statements')
  const maxTime: number = input.getData('max_time')
  const botConfigs: ContactableInitConfig = input.getData('bot_configs')
  const contactableConfigs: ContactableConfig[] = input.getData('contactable_configs')
  const maxResponsesText: string = input.getData('max_responses_text')
  const allCompletedText: string = input.getData('all_completed_text')
  const invalidResponseText: string = input.getData('invalid_response_text')
  const timeoutText: string = input.getData('timeout_text')

  let contactables: Contactable[]
  try {
    await contactableInit(whichToInit(contactableConfigs), botConfigs)
    contactables = contactableConfigs.map(makeContactable)
  } catch (e) {
    output.send({
      error: e
    })
    output.done()
    return
  }

  try {
    const results: PairwiseVote[] = await coreLogic(
      contactables,
      statements,
      choice,
      maxTime,
      (pairwiseVote: PairwiseVote): void => {
        output.send({ pairwise_vote: pairwiseVote })
      },
      maxResponsesText,
      allCompletedText,
      timeoutText,
      invalidResponseText
    )
    await contactableShutdown()
    output.send({
      results
    })
  } catch (e) {
    await contactableShutdown()
    output.send({
      error: e
    })
  }
  output.done()
}

const getComponent = (): NofloComponent => {
  const c: NofloComponent = new noflo.Component()

  /* META */
  c.description = 'Iterate through all the combinations in a list of statements getting peoples choices on them'
  c.icon = 'compress'

  /* IN PORTS */
  c.inPorts.add('choice', {
    datatype: 'string',
    description: 'a human readable string clarifying what a choice for either of any two options means',
    required: true
  })
  c.inPorts.add('statements', {
    datatype: 'array', // rsf-types/Statement[]
    description: 'the list of statements (as objects with property "text") to create all possible pairs out of, and make choices between',
    required: true
  })
  c.inPorts.add('max_time', {
    datatype: 'int',
    description: 'the number of seconds to wait until stopping this process automatically',
    required: true
  })
  c.inPorts.add('contactable_configs', {
    datatype: 'array', // rsf-types/ContactableConfig[]
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
  c.inPorts.add('all_completed_text', {
    datatype: 'string',
    description: 'msg override: the message sent to all participants when the process completes, by completion by all participants'
  })
  c.inPorts.add('invalid_response_text', {
    datatype: 'string',
    description: 'msg override: the message sent when participant use an invalid response'
  })
  c.inPorts.add('timeout_text', {
    datatype: 'string',
    description: 'msg override: the message sent to all participants when the process completes because the timeout is reached'
  })

  /* OUT PORTS */
  c.outPorts.add('pairwise_vote', {
    datatype: 'object' // rsf-types/PairwiseVote
  })
  c.outPorts.add('results', {
    datatype: 'array' // rsf-types/PairwiseVote[]
  })
  c.outPorts.add('error', {
    datatype: 'all'
  })

  /* DEFINE PROCESS */
  c.process(process)

  return c
}

export {
  coreLogic,
  getComponent
}