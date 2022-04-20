const { ethers } = require('hardhat');
const { BigNumber } = ethers;

async function main() {
    const [ owner ] = ethers.getSigners();

    const SEUROContract = await ethers.getContractFactory('SEuro');
    const SEURO = await SEUROContract.deploy("sEURO", "SEUR", [owner])
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');

    const INITIAL_PRICE = BigNumber.from(700_000_000_000_000_000);
    const MAX_SUPPLY = BigNumber.from(200_000_000);
    const BondingCurve = await BondingCurveContract.deploy(SEURO, INITIAL_PRICE, MAX_SUPPLY);

    console.log(await BondingCurve.pricePerEuro())
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
