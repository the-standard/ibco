require("@nomiclabs/hardhat-waffle");
require('dotenv').config();
require('solidity-coverage')
require('hardhat-contract-sizer');

const { INFURA_API_KEY } = process.env;

module.exports = {
  solidity: "0.8.14",
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      },
      chainId: 1559
    }
  }
};
