const { ethers } = require('hardhat');
const fs = require('fs');
let addresses;

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('200000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');
const BONDING_EVENT_TOKEN = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT
const UNISWAP_LIQ_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const OPERATOR_ADDRESS = ethers.constants.AddressZero; // update this when we have the operator
const TST_ADDRESS = '0xa0b93B9e90aB887E53F9FB8728c009746e989B53';

const deployContracts = async () => {
    const SEuro = await (await ethers.getContractFactory('SEuro')).deploy('sEURO', 'SEUR', []);
    const BondingCurve = await (await ethers.getContractFactory('BondingCurve')).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculator = await (await ethers.getContractFactory('SEuroCalculator')).deploy(BondingCurve.address);
    const TokenManager = await (await ethers.getContractFactory('TokenManager')).deploy();
    const SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
        SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address
    );
    const StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(TST_ADDRESS, SEuro.address);
    const BondStorage = await (await ethers.getContractFactory('BondStorage')).deploy(StandardTokenGateway.address);
    const BondingEvent = await (await ethers.getContractFactory('BondingEvent')).deploy(
        SEuro.address, BONDING_EVENT_TOKEN, UNISWAP_LIQ_MANAGER, BondStorage.address, OPERATOR_ADDRESS
    );

    await SEuro.deployed();
    await BondingCurve.deployed();
    await SEuroCalculator.deployed();
    await TokenManager.deployed();
    await SEuroOffering.deployed();
    await StandardTokenGateway.deployed();
    await BondStorage.deployed();
    await BondingEvent.deployed();

    addresses = {
        SEuroOffering: SEuroOffering.address,
        SEuro: SEuro.address,
        SEuroCalculator: SEuroCalculator.address,
        TokenManager: TokenManager.address,
        BondingCurve: BondingCurve.address,
        BondingEvent: BondingEvent.address,
        BondStorage: BondStorage.address,
        StandardTokenGateway: StandardTokenGateway.address
    };

    return addresses
}

const activateSEuroOffering = async () => {
    const [owner] = await ethers.getSigners();
    const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
    await SEuroOffering.connect(owner).activate();
}

const contractsFrontendReady = async () => {
    await activateSEuroOffering();
}

module.exports = {
    deployContracts,
    contractsFrontendReady
}