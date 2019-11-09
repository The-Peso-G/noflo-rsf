/*
 Built for compatibility with https://github.com/rapid-sensemaking-framework/rsf-http-register
*/

import noflo from 'noflo'
import socketClient from 'socket.io-client'

const guidGenerator = () => {
  const S4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
  return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4())
}

const process = (input, output) => {

  // TODO set a timeout

  // Check preconditions on input data
  if (!input.hasData('socket_url', 'max_time', 'max_participants', 'process_description')) {
    return
  }

  // Read packets we need to process
  const httpUrl = input.getData('http_url')
  const socketUrl = input.getData('socket_url')
  const maxTime = input.getData('max_time')
  const maxParticipants = parseInt(input.getData('max_participants'))
  const processDescription = input.getData('process_description')
  // create a brand new id which will be used
  // in the url address on the site, where people will register
  const id = guidGenerator()

  const socket = socketClient(socketUrl)
  socket.on('connect', () => {
    socket.emit('participant_register', { id, maxParticipants, maxTime, processDescription })
    output.send({
      register_url: `${httpUrl}/register/${id}`
    })
  })
  // single one
  socket.on('participant_register_result', result => {
    output.send({
      result
    })
  })
  // all results
  socket.on('participant_register_results', results => {
    output.send({
      results
    })
    output.done()
  })
}

const getComponent = () => {
  const c = new noflo.Component()

  /* META */
  c.description = 'Spins up a web server to collect participant configs that are rsf-contactable compatible'
  c.icon = 'compress'

  /* IN PORTS */
  c.inPorts.add('http_url', {
    datatype: 'string',
    description: 'the http url used to determine the address for the register page',
    required: true
  })
  c.inPorts.add('socket_url', {
    datatype: 'string',
    description: 'the url with websocket protocol to connect to run this function',
    required: true
  })
  c.inPorts.add('max_time', {
    datatype: 'int',
    description: 'the number of seconds to wait until stopping this process automatically',
    required: true
  })
  c.inPorts.add('max_participants', {
    datatype: 'int',
    description: 'the number of participants to welcome to the process, default is unlimited',
    required: true
  })
  c.inPorts.add('process_description', {
    datatype: 'string',
    description: 'the text to display to potential participants explaining the process',
    required: true
  })


  /* OUT PORTS */
  c.outPorts.add('register_url', {
    datatype: 'string'
  })
  c.outPorts.add('result', {
    datatype: 'object' // ContactableConfig
  })
  c.outPorts.add('results', {
    datatype: 'array' // ContactableConfig[]
  })

  /* DEFINE PROCESS */
  c.process(process)

  /* return */
  return c
}

export {
  getComponent
}