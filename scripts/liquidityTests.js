const { BigNumber } = require('ethers');
const fs = require('fs');
const { ethers } = require('hardhat');
const { encodePriceSqrt } = require('../test/common');

let LiqTest, SEuro, Other, user;

const deployContracts = async () => {
    SEuro = await (await ethers.getContractFactory('DUMMY')).deploy('sEURO', 'SEUR', 0);
    Other = await (await ethers.getContractFactory('DUMMY')).deploy('Other', 'OTH', 0);
    RatioCalculator = await (await ethers.getContractFactory('RatioCalculator')).deploy();
    LiqTest = await (await ethers.getContractFactory('LiqTest')).deploy(SEuro.address, Other.address, RatioCalculator.address);
}

const mintUser = async (amount) => {
    await SEuro.mint(user.address, amount);
    await Other.mint(user.address, amount);
}

const initialisePoolAtPrice = async (sqrtPrice) => {
    await LiqTest.initialisePool(sqrtPrice, 500);
}

const getPoolState = async () => {
    return await LiqTest.getPoolState();
}

const addLiquidity = async (amountSEuro, amountOther, lower, upper) => {
    await LiqTest.addLiquidity(amountSEuro, amountOther, lower, upper)
}

const tickInfo = async (tick) => {
    return await LiqTest.tickInfo(tick);
}

const getOtherAmount = async (amountSEuro, lowerTick, upperTick) => {
    return await LiqTest.getOtherAmount(amountSEuro, lowerTick, upperTick);
}

async function main() {
    [user] = await ethers.getSigners();
    await deployContracts();
    console.log(SEuro.address)
    console.log(Other.address)
    console.log(await LiqTest.getAscendingPair())

    await mintUser(ethers.utils.parseEther('1000000'));
    
    const sqrtPrice = SEuro.address < Other.address ? encodePriceSqrt(114, 100) : encodePriceSqrt(100, 114);
    await initialisePoolAtPrice(sqrtPrice);
    
    console.log(await getPoolState());

    const amountSEuro = ethers.utils.parseEther('10000');
    const amountOther = await getOtherAmount(amountSEuro, -3000, 400);
    console.log(amountOther)
    // await SEuro.approve(LiqTest.address, amountSEuro)
    // await Other.approve(LiqTest.address, amountOther)
    // await addLiquidity(amountSEuro, amountOther, -2230, -490);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });





// x = 1000000000000000000000
// P = 79228162514264337593543950336
// P(a) = 77272108795590369356373805297
// P(b) = 81233731461783161732293370115
// L(of x ?) = x * ((sqrt(P) * sqrt(Pb)) / (sqrt(Pb) - sqrt(P)))
// Lx = 22660154694028720484609726924953957702.7292291002024029412597
// y = 999999999999999999999 !!!!!!!!!!
