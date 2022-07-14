const { ethers, network } = require('hardhat');
const fs = require('fs');
let addresses;
let DummyTST, DummyUSDT, SEuro;

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('200000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');
const OPERATOR_ADDRESS = ethers.constants.AddressZero; // update this when we have the operator

const completed = async (contract, name) => {
    console.log(`${name} deploying ...`)
    await contract.deployed();
    console.log(`${name} deployed !`)
}

const deployContracts = async () => {
    const { externalContracts } = JSON.parse(fs.readFileSync('scripts/deploymentConfig.json'))[network.name];

    DummyTST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 0);
    await completed(DummyTST, 'TST');
    DummyUSDT = await (await ethers.getContractFactory('DUMMY')).deploy('Tether', 'USDT', 0);
    await completed(DummyUSDT, 'USDT');
    SEuro = await (await ethers.getContractFactory('SEuro')).deploy('sEURO', 'SEUR', []);
    await completed(SEuro, 'SEuro');
    const BondingCurve = await (await ethers.getContractFactory('BondingCurve')).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    await completed(BondingCurve, 'BondingCurve')
    const SEuroCalculator = await (await ethers.getContractFactory('SEuroCalculator')).deploy(BondingCurve.address, externalContracts.eurUsdCl.address, externalContracts.eurUsdCl.dec);
    await completed(SEuroCalculator, 'SEuroCalculator')
    const TokenManager = await (await ethers.getContractFactory('TokenManager')).deploy(externalContracts.weth, externalContracts.ethUsdCl.address, externalContracts.ethUsdCl.dec);
    await completed(TokenManager, 'TokenManager')
    const SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
        SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address
    );
    await completed(SEuroOffering, 'SEuroOffering')
    const StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(DummyTST.address, SEuro.address);
    await completed(StandardTokenGateway, 'StandardTokenGateway')
    const BondStorage = await (await ethers.getContractFactory('BondStorage')).deploy(StandardTokenGateway.address);
    await completed(BondStorage, 'BondStorage')
    const BondingEvent = await (await ethers.getContractFactory('BondingEvent')).deploy(
        SEuro.address, DummyUSDT.address, externalContracts.uniswapLiquidityManager, BondStorage.address, OPERATOR_ADDRESS
    );
    await completed(BondingEvent, 'BondingEvent')

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

const mintUsers = async(addresses) => {
    const million = ethers.utils.parseEther('1000000');
    await SEuro.mint(addresses[0], million);
    await DummyUSDT.mint(addresses[0], million);
    await SEuro.mint(addresses[1], million);
    await DummyUSDT.mint(addresses[1], million);
}

module.exports = {
    deployContracts,
    contractsFrontendReady,
    mintUsers
}