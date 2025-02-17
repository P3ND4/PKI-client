const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { generateKey } = require('crypto');
const { create } = require('domain');
const { userInfo } = require('os');

const axios = require("axios");
const { name } = require('ejs');
const { createMSPStructureOrg, createMSPStructurePeer, generateCongigTX } = require('./utils');
const { domainToUnicode } = require('url');









const GenerateMSP = async () => {
  const configPath = path.join(__dirname, '../crypto-config.yaml');

  // Leer el archivo de configuración
  let config;
  try {
    const configContent = fs.readFileSync(configPath);
    config = yaml.load(configContent);
  } catch (err) {
    console.log('crypto-config.yaml required', err);
    return false;
  }

  const network = config.Network || [];
  let mainPath = path.join(__dirname, `../${network['-Name']}-network`);

  try {
    fs.rmdirSync(mainPath, { recursive: true });
  } catch (err) {}

  try {
    fs.mkdirSync(mainPath);
  } catch (err) {
    console.log(err);
  }

  var orgDirList = {};
  var orgsInfo = [];
  var orderersIfo = [];

  const ordererOrgs = config.OrdererOrgs || [];

  // Acceder a las organizaciones de orderers
  for (const org of ordererOrgs) {
    console.log('Orderer Org:');
    console.log('  Name:', org.Name);
    console.log('  Domain:', org.Domain);
    orgDirList[org.Domain] = path.join(mainPath, `crypto-config/ordererOrganizations/${org.Domain}`);
    
    fs.mkdirSync(orgDirList[org.Domain], { recursive: true });

    const orderersPath = path.join(orgDirList[org.Domain], `orderers/orderer.${org.Domain}`);
    await createMSPStructurePeer(orderersPath, `orderer.${org.Domain}`, org.Domain, 'orderer');

    const userPath = path.join(orgDirList[org.Domain], `users/Admin@${org.Domain}`);
    await createMSPStructureOrg(orgDirList[org.Domain], org.Domain);
    await createMSPStructurePeer(userPath, `Admin@${org.Domain}`, org.Domain, 'admin');

    fs.mkdirSync(path.join(userPath, 'tls'), { recursive: true });
    fs.mkdirSync(path.join(orderersPath, 'tls'), { recursive: true });

    orderersIfo.push({
      name: org.Name,
      domain: org.Domain,
    });
  }

  const peerOrgs = config.PeerOrgs || [];

  // Acceder a las organizaciones de peers
  for (const org of peerOrgs) {
    console.log('Peer Org:');
    console.log('  Name:', org.Name);
    console.log('  Domain:', org.Domain);

    orgDirList[org.Domain] = path.join(mainPath, `crypto-config/peerOrganizations/${org.Domain}`);
    var anchor = null;

    const pathpeers = path.join(orgDirList[org.Domain], 'peers');
    fs.mkdirSync(orgDirList[org.Domain], { recursive: true });

    await createMSPStructureOrg(orgDirList[org.Domain], org.Domain);

    const peers = org.Peers || [];
    for (const peer of peers) {
      const peerPath = path.join(pathpeers, `${peer.Domain}`);
      console.log('peers:');
      console.log('Name', peer.Name);
      console.log('  Domain:', peer.Domain);
      anchor = peer.Domain;
      await createMSPStructurePeer(peerPath, peer.Domain, org.Domain, 'peer');
    }

    orgsInfo.push({
      name: org.Name,
      domain: org.Domain,
      anchor: anchor,
    });
  }

  // Esperar a que se complete la generación del archivo de configuración
  var configTxB = generateCongigTX(orgsInfo, orderersIfo[0].name, orderersIfo[0].domain);
  fs.writeFileSync(path.join(mainPath, 'configtx.yaml'), configTxB)
};

GenerateMSP();
