const { ethers } = require('hardhat');
const fs = require('fs');

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('200000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');

async function main() {
    const [user] = await ethers.getSigners();
    const SEuro = await (await ethers.getContractFactory('SEuro')).connect(user).deploy('sEURO', 'SEUR', []);
    const BondingCurve = await (await ethers.getContractFactory('BondingCurve')).connect(user).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculator = await (await ethers.getContractFactory('SEuroCalculator')).connect(user).deploy(BondingCurve.address);
    const TokenManager = await (await ethers.getContractFactory('TokenManager')).connect(user).deploy();
    const SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).connect(user).deploy(
        SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address
    );
    await SEuro.deployed();
    await BondingCurve.deployed();
    await SEuroCalculator.deployed();
    await TokenManager.deployed();
    await SEuroOffering.deployed();

    const minterRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
    await SEuro.grantRole(minterRole, SEuroOffering.address);

    const addresses = {
        SEuroOffering: SEuroOffering.address,
        SEuro: SEuro.address,
        SEuroCalculator: SEuroCalculator.address,
        TokenManager: TokenManager.address,
        BondingCurve: BondingCurve.address
    }

    const json = JSON.stringify(addresses);
    console.log(json)
    fs.writeFileSync('deploymentAddresses.json', json);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });