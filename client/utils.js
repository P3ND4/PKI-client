const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path')
const axios = require('axios');
const { channel } = require('diagnostics_channel');

const congifYaml = `NodeOUs:
Enable: true
ClientOUIdentifier:
  Certificate: cacerts/my.org-ca-cert.pem
  OrganizationalUnitIdentifier: client
PeerOUIdentifier:
  Certificate: cacerts/my.org-ca-cert.pem
  OrganizationalUnitIdentifier: peer
AdminOUIdentifier:
  Certificate: cacerts/my.org-ca-cert.pem
  OrganizationalUnitIdentifier: admin
OrdererOUIdentifier:
  Certificate: cacerts/my.org-ca-cert.pem
  OrganizationalUnitIdentifier: orderer
`;
const capt = `
    Capabilities:
        Channel: &ChannelCapabilities
            V2_0: true
    
        Orderer: &OrdererCapabilities
            V2_0: true
    
        Application: &ApplicationCapabilities
            V2_0: true      `
const app = `
    Application: &ApplicationDefaults
    
        Organizations:

        Policies:
            Readers:
                Type: ImplicitMeta
                Rule: "ANY Readers"
            Writers:
                Type: ImplicitMeta
                Rule: "ANY Writers"
            Admins:
                Type: ImplicitMeta
                Rule: "MAJORITY Admins"
            LifecycleEndorsement:
                Type: ImplicitMeta
                Rule: "MAJORITY Endorsement"
            Endorsement:
                Type: ImplicitMeta
                Rule: "MAJORITY Endorsement"

        Capabilities:
            <<: *ApplicationCapabilities   `
const ordererOrgs = (name, domain, port) => {
  return `
        - &${name}Org
            Name: ${name}Org
            ID: ${name}MSP
            MSPDir: crypto-config/ordererOrganizations/${domain}/msp
            Policies:
                Readers:
                    Type: Signature
                    Rule: "OR('${name}MSP.member')"
                Writers:
                    Type: Signature
                    Rule: "OR('${name}MSP.member')"
                Admins:
                    Type: Signature
                    Rule: "OR('${name}MSP.admin')"
            OrdererEndpoints:
                - orderer.${domain}:7050`
}
const Orgs = (name, domain, anchor, port) => {
  return `
        - &${name}
            Name: ${name}MSP
            ID: ${name}MSP
            MSPDir: crypto-config/peerOrganizations/${domain}/msp
            Policies:
                Readers:
                    Type: Signature
                    Rule: "OR('${name}MSP.admin', '${name}MSP.peer', '${name}MSP.client')"
                Writers:
                    Type: Signature
                    Rule: "OR('${name}MSP.admin', '${name}MSP.client')"
                Admins:
                    Type: Signature
                    Rule: "OR('${name}MSP.admin')"
                Endorsement:
                    Type: Signature
                    Rule: "OR('${name}MSP.peer')"
            AnchorPeers:
                - Host: ${anchor}
                  Port: 7051`
}
const soloConsensure = (name, domain) => {
  return `    
    Orderer: &OrdererDefaults

        OrdererType: solo

#       OrdererType: etcdraft

        EtcdRaft:
            Consenters:
            - Host: ${domain}
              Port: 7050
              ClientTLSCert: ../organizations/ordererOrganizations/${domain}/orderers/orderer.${domain}/tls/server.crt
              ServerTLSCert: ../organizations/ordererOrganizations/${domain}/orderers/orderer.${domain}/tls/server.crt

        Addresses:
            - orderer.${domain}:7050
        BatchTimeout: 2s
        BatchSize:
            MaxMessageCount: 10
            AbsoluteMaxBytes: 99 MB
            PreferredMaxBytes: 512 KB

        Kafka:
            Brokers:
                - 127.0.0.1:9092
        Organizations:

        Policies:
            Readers:
                Type: ImplicitMeta
                Rule: "ANY Readers"
            Writers:
                Type: ImplicitMeta
                Rule: "ANY Writers"
            Admins:
                Type: ImplicitMeta
                Rule: "MAJORITY Admins"

            BlockValidation:
                Type: ImplicitMeta
                Rule: "ANY Writers"`
}
const orgNamesC = (orgs) => {
  result = ''
  orgs.forEach(org => {
    result += `                        - *${org.name}\n`
  })
  return result
}
const orgNamesA = (orgs) => {
  result = ''
  orgs.forEach(org => {
    result += `                    - *${org.name}\n`
  })
  return result
}

const channelDefaults = (orgs) => {
  return `
    Channel: &ChannelDefaults

        Policies:
            # Who may invoke the 'Deliver' API
            Readers:
                Type: ImplicitMeta
                Rule: "ANY Readers"
            # Who may invoke the 'Broadcast' API
            Writers:
                Type: ImplicitMeta
                Rule: "ANY Writers"
            # By default, who may modify elements at this config level
            Admins:
                Type: ImplicitMeta
                Rule: "MAJORITY Admins"

        Capabilities:
            <<: *ChannelCapabilities

################################################################################
#   Profile
################################################################################
    Profiles:

        MultiOrgsOrdererGenesis:
            <<: *ChannelDefaults
            Orderer:
                <<: *OrdererDefaults
                Organizations:
                    - *OrdererOrg
                Capabilities:
                    <<: *OrdererCapabilities
            Consortiums:
                SampleConsortium:
                    Organizations:
${orgNamesC(orgs)}
        MultiOrgsChannel:
            Consortium: SampleConsortium
            <<: *ChannelDefaults
            Application:
                <<: *ApplicationDefaults
                Organizations:
${orgNamesA(orgs)}
            Capabilities:
                <<: *ApplicationCapabilities`
}










function generateCongigTX(orgs, OrderersName, OrderersDomain) {
  var port = 7050;
  result ='---\n' + '    Organizations:\n'+ ordererOrgs(OrderersName, OrderersDomain, port) + '\n'
  orgsBody = ''
  orgs.forEach(org => {
    orgsBody += Orgs(org.name, org.domain, org.anchor, port+1) + '\n'
  })
  result += orgsBody + capt + '\n' + app + '\n' + soloConsensure(OrderersName, OrderersDomain) +'\n' + channelDefaults(orgs) + '\n'


  return result

}




function generateECDSACSR(commonName, organization, ou, dir_k = __dirname) {
  const keyPath = path.join(dir_k, `priv_sk`);
  const csrPath = path.join(dir_k, `${commonName}.csr`);

  try {
    // 1️⃣ Generar clave privada ECDSA (prime256v1)
    execSync(`openssl ecparam -name prime256v1 -genkey -noout -out ${keyPath}`);

    // 2️⃣ Crear el CSR
    execSync(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "/CN=${commonName}/O=${organization}/OU=${ou}"`);
    // Leer los archivos generados
    const privateKey = fs.readFileSync(keyPath, "utf8");
    const csr = fs.readFileSync(csrPath, "utf8");
    fs.rmSync(csrPath)

    return { key: privateKey, csr };
  } catch (error) {
    console.error("❌ Error generando CSR:", error.message);
    throw error;
  }
}



async function signCsr(mspPath, domain, org, ou) {
  const keyPath = path.join(mspPath, 'keystore');
  const certPath = path.join(mspPath, 'signcerts');
  const { key, csr } = generateECDSACSR(domain, org, ou, keyPath);
  const response = await axios.post("http://localhost:2000/sign-csr", {
    domain,
    csr
  });
  fs.writeFileSync(path.join(certPath, `${domain}-cert.pem`), response.data.cert, 'utf8');
  return { key: key, cert: response.data.cert }
}


async function createMSPStructurePeer(baseDir, domain, org, ou) {
  // Definir los directorios típicos de un MSP
  const mspDirs = ['cacerts', 'tlscacerts', 'keystore', 'signcerts'];
  const mspBase = path.join(baseDir, 'msp');
  const tls_dir = path.join(baseDir, 'tls');
  const response = await axios.get("http://localhost:2000/root-ca");
  fs.mkdirSync(tls_dir, { recursive: true });
  mspDirs.forEach(async dirName => {
    const fullPath = path.join(mspBase, dirName);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Directorio creado: ${fullPath}`);
    if (dirName in ['cacerts', 'tlscacerts']) {
      fs.writeFileSync(path.join(fullPath, 'my.org-ca-cert.pem'), response.data.cert);
    }
  });
  const sign = await signCsr(mspBase, domain, org, ou);
  fs.writeFileSync(path.join(mspBase, 'config.yaml'), congifYaml)
  fs.writeFileSync(path.join(tls_dir, 'ca.crt'), response.data.cert)
  fs.writeFileSync(path.join(tls_dir, 'server.crt'), sign['cert'])
  fs.writeFileSync(path.join(tls_dir, 'server.key'), sign['key'])
}
async function createMSPStructureOrg(baseDir, domain) {
  const mspDirs = ['cacerts', 'tlscacerts']
  const mspBase = path.join(baseDir, 'msp');
  const response = await axios.get("http://localhost:2000/root-ca");
  mspDirs.forEach(dirName => {
    const fullPath = path.join(mspBase, dirName);
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, 'my.org-ca-cert.pem'), response.data.cert);
    console.log(`Directorio creado: ${fullPath}`);

  });
  fs.writeFileSync(path.join(mspBase, 'config.yaml'), congifYaml)


}





module.exports = { generateECDSACSR, createMSPStructureOrg, createMSPStructurePeer, generateCongigTX }