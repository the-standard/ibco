const { ethers } = require('hardhat');
const { BigNumber } = ethers;

async function main() {
    const [ owner, user ] = await ethers.getSigners();

    const SEUROContract = await ethers.getContractFactory('SEuro');
    const SEURO = await SEUROContract.deploy("sEURO", "SEUR", [owner.address])
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');

    
    
    const INITIAL_PRICE = BigNumber.from(7).mul(BigNumber.from(10).pow(BigNumber.from(17)));
    const MAX_SUPPLY = 200_000_000;
    const BondingCurve = await BondingCurveContract.deploy(SEURO.address, INITIAL_PRICE, MAX_SUPPLY);
    
    await SEURO.connect(owner).mint(user.address, 1_000_000);
    // 803971705678918346
    console.log(await BondingCurve.pricePerEuro())
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
