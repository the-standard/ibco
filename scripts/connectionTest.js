const { ethers, network } = require('hardhat');
const fs = require('fs');

async function main() {
    const [user] = await ethers.getSigners()
    const addresses = JSON.parse(fs.readFileSync('deploymentAddresses.json'))
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const curve = await BondingCurveContract.attach(addresses.BondingCurve);
    console.log(await curve.connect(user).blah(5));
    // const calculate = await curve.calculatePrice2(ethers.utils.parseEther('100'));
    // const wait = await calculate.wait();
    // console.log(calculate);
    // console.log(wait);
    // const events = calculate.events.filter(e => ['Price', 'SEuroTotal'].includes(e.event));
    // console.log(events);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });