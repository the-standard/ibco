require("@nomiclabs/hardhat-waffle");
require('dotenv').config();
require('solidity-coverage')
require('hardhat-contract-sizer');

const { INFURA_API_KEY, TEST_ACCOUNT_PRIVATE_KEY } = process.env;

let testAccounts = TEST_ACCOUNT_PRIVATE_KEY ? [TEST_ACCOUNT_PRIVATE_KEY] : [];

module.exports = {
  // solidity: "0.8.14",
  solidity: {
    compilers: [
      {
        version: "0.8.14",
      },
      {
        version: "0.7.6",
      }
    ]
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      },
      chainId: 31337
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
      accounts: testAccounts
    }
  }
};
