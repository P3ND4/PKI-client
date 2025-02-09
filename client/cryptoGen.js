const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { generateKey } = require('crypto');
const { create } = require('domain');
const { userInfo } = require('os');

const axios = require("axios");
const { name } = require('ejs');
const { createMSPStructureOrg, createMSPStructurePeer}  = require('./utils')











const GenerateMSP = () => {
  const configPath = path.join(__dirname, '../crypto-config.yaml');


  // Crear directorio de configuracion
  let config;
  try {
    const configContent = fs.readFileSync(configPath);
    config = yaml.load(configContent);
  }
  catch (err) {
    console.log('crypto-config.yaml required', err);
    return false;
  }
  const network = config.Network || [];
  let mainPath;
  mainPath = path.join(__dirname, `../${network['-Name']}-network`);
  try{
    fs.rmdirSync(mainPath, {recursive: true})
  }
  catch{
    
  }

  try {
    fs.mkdirSync(mainPath);
  }
  catch (err) {
    console.log(err);
  }

  var orgDirList = {};


  const ordererOrgs = config.OrdererOrgs || [];
  // Acceder a las organizaciones de orderers
  ordererOrgs.forEach(async org => {
    console.log('Orderer Org:');
    console.log('  Name:', org.Name);
    console.log('  Domain:', org.Domain);
    orgDirList[org.Domain] = path.join(mainPath, `crypto-config/ordererOrganizations/${org.Domain}`);
    fs.mkdirSync(orgDirList[org.Domain], { recursive: true })
    orderersPath = path.join(orgDirList[org.Domain], `orderers/orderer.${org.Domain}`)
    await createMSPStructurePeer(orderersPath, `orderer.${org.Domain}`, org.Domain, 'orderer')
    userPath = path.join(orgDirList[org.Domain], `users/Admin@${org.Domain}`)
    await createMSPStructureOrg(orgDirList[org.Domain], org.Domain);
    await createMSPStructurePeer(userPath, `Admin@${org.Domain}`, org.Domain, 'admin');
    fs.mkdirSync(path.join(userPath, 'tls'), { recursive: true })


    fs.mkdirSync(path.join(orderersPath, 'tls'), { recursive: true })
  
  });

  const peerOrgs = config.PeerOrgs || [];
  peerOrgs.forEach(async org => {
    console.log('Peer Org:');
    console.log('  Name:', org.Name);
    console.log('  Domain:', org.Domain);
    orgDirList[org.Domain] = path.join(mainPath, `crypto-config/peerOrganizations/${org.Domain}`);
    const pathpeers = path.join(orgDirList[org.Domain], 'peers')
    fs.mkdirSync(orgDirList[org.Domain], { recursive: true })
    fs.mkdirSync(orgDirList[org.Domain], { recursive: true })
    await createMSPStructureOrg(orgDirList[org.Domain], org.Domain)
    const peers = org.Peers || [];
    peers.forEach(async peer => {
      const peerPath = path.join(pathpeers, `${peer.Domain}`)
      console.log('peers:')
      console.log('Name', peer.Name)
      console.log('  Domain:', peer.Domain);
      await createMSPStructurePeer(peerPath, peer.Domain, org.Domain, 'peer')
    });
  });
}

GenerateMSP()