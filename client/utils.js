const fs = require('fs');
const {execSync} = require('child_process');
const path  = require('path')
const axios = require('axios')

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
  const {key, csr } = generateECDSACSR(domain, org, ou, keyPath);
  const response = await axios.post("http://localhost:2000/sign-csr", {
    domain,
    csr
  });
  fs.writeFileSync(path.join(certPath, `${domain}-cert.pem`), response.data.cert, 'utf8');
  return {key: key , cert: response.data.cert }
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
    if (dirName in ['cacerts', 'tlscacerts']){
      fs.writeFileSync(path.join(fullPath, 'my.org-ca-cert.pem'), response.data.cert);
    }
  });
  const sign = await signCsr(mspBase, domain, org, ou);
  fs.writeFileSync(path.join(mspBase, 'config.yaml'), congifYaml)
  fs.writeFileSync(path.join(tls_dir, 'ca.crt'), response.data.cert)
  fs.writeFileSync(path.join(tls_dir, 'server.crt'), sign['cert'])
  fs.writeFileSync(path.join(tls_dir, 'server.key'), sign['key'])
}
async function createMSPStructureOrg(baseDir, domain){
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





module.exports =  {generateECDSACSR, createMSPStructureOrg, createMSPStructurePeer}