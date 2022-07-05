const { ethers } = require('hardhat');
let addresses;
let DummyTST, DummyUSDT;

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('200000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');
const UNISWAP_LIQ_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const OPERATOR_ADDRESS = ethers.constants.AddressZero; // update this when we have the operator

const deployContracts = async () => {
    DummyTST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 0);
    DummyUSDT = await (await ethers.getContractFactory('DUMMY')).deploy('Tether', 'USDT', 0);
    const SEuro = await (await ethers.getContractFactory('SEuro')).deploy('sEURO', 'SEUR', []);
    const BondingCurve = await (await ethers.getContractFactory('BondingCurve')).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculator = await (await ethers.getContractFactory('SEuroCalculator')).deploy(BondingCurve.address);
    const TokenManager = await (await ethers.getContractFactory('TokenManager')).deploy();
    const SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
        SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address
    );
    const StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(DummyTST.address, SEuro.address);
    const BondStorage = await (await ethers.getContractFactory('BondStorage')).deploy(StandardTokenGateway.address);
    const BondingEvent = await (await ethers.getContractFactory('BondingEvent')).deploy(
        SEuro.address, DummyUSDT.address, UNISWAP_LIQ_MANAGER, BondStorage.address, OPERATOR_ADDRESS
    );

    await DummyTST.deployed();
    await DummyUSDT.deployed();
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
        StandardTokenGateway: StandardTokenGateway.address,
        TST: DummyTST.address,
        USDT: DummyUSDT.address
    };

    return addresses
}

const activateSEuroOffering = async () => {
    const [owner] = await ethers.getSigners();
    const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
    await SEuroOffering.connect(owner).activate();
}

const mintTokensForAccount = async (accounts) => {
    const million = ethers.utils.parseEther('1000000');
    const mints = accounts.map(async account => {
        await DummyTST.mint(account, million);
        await DummyUSDT.mint(account, million);
    })
    await Promise.all(mints);
}

const contractsFrontendReady = async (accounts) => {
    await activateSEuroOffering();
    await mintTokensForAccount(accounts);
}

module.exports = {
    deployContracts,
    contractsFrontendReady
}