const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path')
const axios = require('axios');
const { channel } = require('diagnostics_channel');


const peerBase = (network) => {
  return `
version: '2'

services:
  peer-base:
    image: hyperledger/fabric-peer:2.2.0
    environment:
      - CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock
      # the following setting starts chaincode containers on the same
      # bridge network as the peers
      # https://docs.docker.com/compose/networking/
      # ---CHANGED---
      - CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=${network}-network_basic
      - FABRIC_LOGGING_SPEC=INFO
     # - FABRIC_LOGGING_SPEC=DEBUG
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_GOSSIP_USELEADERELECTION=true
      - CORE_PEER_GOSSIP_ORGLEADER=false
      - CORE_PEER_PROFILE_ENABLED=true
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    command: peer node start
`
}

const peerBaseFull = (peer, port  ) => {
  return `
  ${peer.domain}:
    # ---CHANGED--- Container name – same as the peer name
    container_name: ${peer.domain}
    extends:
      file: peer-base.yaml
      service: peer-base
    environment:
      # ---CHANGED--- changed to reflect peer name, org name and our company's domain
      - CORE_PEER_ID=${peer.domain}
      # ---CHANGED--- changed to reflect peer name, org name and our company's domain
      - CORE_PEER_ADDRESS=${peer.domain}:7051
      # ---CHANGED--- changed to reflect peer name, org name and our company's domain
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=${peer.domain}:7051
      # ---CHANGED--- changed to reflect peer name, org name and our company's domain
      - CORE_PEER_GOSSIP_BOOTSTRAP=${peer.domain}:7051      
      - CORE_PEER_LOCALMSPID=${peer.orgName}MSP
    volumes:
        - /var/run/:/host/var/run/
        # ---CHANGED--- changed to reflect peer name, org name and our company's domain
        - ../crypto-config/peerOrganizations/${peer.orgDomain}/peers/${peer.domain}/msp:/etc/hyperledger/fabric/msp
        # ---CHANGED--- changed to reflect peer name, org name and our company's domain
        - ../crypto-config/peerOrganizations/${peer.orgDomain}/peers/${peer.domain}/tls:/etc/hyperledger/fabric/tls
    ports:
      - ${port}:7051
      - ${port+2}:7053
  `
}

const ordererBase = (orderer) => {
  return `
  orderer.${orderer.domain}.com:
    # ---CHANGED--- The container name is a copy of the orderer name
    container_name: orderer.${orderer.domain}.com
    image: hyperledger/fabric-orderer:2.2.0
    environment:
      - ORDERER_GENERAL_LOGLEVEL=debug
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_GENESISMETHOD=file
      - ORDERER_GENERAL_GENESISFILE=/var/hyperledger/orderer/orderer.genesis.block
      - ORDERER_GENERAL_LOCALMSPID=${orderer.name}MSP
      - ORDERER_GENERAL_LOCALMSPDIR=/var/hyperledger/orderer/msp
      # enabled TLS
      - ORDERER_GENERAL_TLS_ENABLED=true
      - ORDERER_GENERAL_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric
    command: orderer
    volumes:
    - ../channel-artifacts/genesis.block:/var/hyperledger/orderer/orderer.genesis.block
    # ---CHANGED--- the path is different to reflect our company's domain
    - ../crypto-config/ordererOrganizations/${orderer.domain}/orderers/orderer.${orderer.domain}/msp:/var/hyperledger/orderer/msp
    # ---CHANGED--- the path is different to reflect our company's domain
    - ../crypto-config/ordererOrganizations/${orderer.domain}/orderers/orderer.${orderer.domain}/tls/:/var/hyperledger/orderer/tls
    ports:
      - 7050:7050
  `
}

const ordererContainer= (orderer) =>{
  return `
  orderer.${orderer.domain}:
    extends:
      file:   base/docker-compose-base.yaml
      # ---CHANGED--- refers to orderer name
      service: orderer.${orderer.domain}
    # ---CHANGED--- The container name is a copy of the orderer name
    container_name: orderer.${orderer.domain}
    networks:
      - basic
  `
}

const peerContainer = (peer, orderer, port, index) => {
  return `
  ${peer.domain}:
    # ---CHANGED--- Container name – same as the peer name
    container_name: ${peer.domain}
    extends:
      file:  base/docker-compose-base.yaml
      # ---CHANGED--- Refers to peer name
      service: ${peer.domain}
    environment:
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb${index}:5984
      - CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin
      - CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw
    depends_on:
      - orderer.${orderer.domain}
      - couchdb${index}
    networks:
      # ---CHANGED--- our network is called "basic"
      - basic

  `
}


const couchDbContainer = (port, index) => {
  return `
  couchdb${index}:
    image: couchdb:3.1
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports: 
      - ${port}:5984
    container_name: couchdb${index}
    networks:
      - basic
  `
}

const CliContainer = (peer, orderer) => {
  return `
  cli:
    container_name: cli
    image: hyperledger/fabric-tools:2.2
    tty: true
    stdin_open: true
    environment:
      - GOPATH=/opt/gopath
      - CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock
      - FABRIC_LOGGING_SPEC=DEBUG
      - CORE_PEER_ID=cli
      # ---CHANGED--- peer0 from Org1 is the default for this CLI container
      - CORE_PEER_ADDRESS=${peer.domain}:7051
      - CORE_PEER_LOCALMSPID=${peer.orgName}MSP
      - CORE_PEER_TLS_ENABLED=true
      # ---CHANGED--- changed to reflect peer0 name, org1 name and our company's domain
      - CORE_PEER_TLS_CERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${peer.orgDomain}/peers/${peer.domain}/tls/server.crt
      # ---CHANGED--- changed to reflect peer0 name, org1 name and our company's domain
      - CORE_PEER_TLS_KEY_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${peer.orgDomain}/peers/${peer.domain}/tls/server.key
      # ---CHANGED--- changed to reflect peer0 name, org1 name and our company's domain
      - CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${peer.orgDomain}/peers/${peer.domain}/tls/ca.crt
      # ---CHANGED--- changed to reflect peer0 name, org1 name and our company's domain
      - CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${peer.orgDomain}/users/Admin@${peer.orgDomain}/msp
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    # ---CHANGED--- command needs to be connected out as we will be issuing commands explicitly, not using by any script

    command: /bin/bash
    volumes:
        - /var/run/:/host/var/run/
        # ---CHANGED--- chaincode path adjusted
        - ./../chaincode/:/opt/gopath/src/github.com/chaincode
        - ./crypto-config:/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/
        - ./channel-artifacts:/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts
    depends_on:
       # ---CHANGED--- reference to our orderer
      - orderer.${orderer.domain}
       # ---CHANGED--- reference to peer0 of Org1
      - ${peer.domain}
    networks:
      # ---CHANGED--- our network is called "basic"
      - basic
  `
}




function buildPeerBaseDC(orderer, peers){
  var port = 7051
  var result = `
version: '2'

services:
  \n`
  result += ordererBase(orderer) + '\n'
  peers.forEach(peer => {
    result += peerBaseFull(peer, port + 1000) + '\n'
    port += 1000
  });
  return result
}

function buildContainers(peers, orderer, cli){
  var result = `
networks:
  basic:
services:
\n
  `
  result += ordererContainer(orderer) + '\n'
  var index = 0
  peers.forEach(peer=>{
    result += peerContainer(peer, orderer, 5984 + index, index) + '\n' + couchDbContainer(5984 + index, index) + '\n'
    index += 1
  })

  result += CliContainer(cli, orderer) 

  return result

}



module.exports = { peerBase, buildPeerBaseDC, buildContainers }