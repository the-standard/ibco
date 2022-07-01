# Getting Started

![Main CI](https://github.com/the-standard/ibco/actions/workflows/.github/workflows/main.yml/badge.svg?branch=master)

## Installation
If you have npm installed, you can install the required project dependencies
```
npm install
```

## Mainnet fork setup
The IBCO tests are run against a forked version of the Ethereum mainnet. You will need an Infura API key to run these tests.
- Create a file `.env` in the root of the IBCO project.
- Sign up to [Infura](https://infura.io/)
- Create a new project in Infura
- Select Ethereum as the product type
- In your new Infura project's settings, locate the Project ID
- Copy Project ID to your new `.env` file as the `INFURA_API_KEY` value:
```
INFURA_API_KEY=123examp1eap1key123456
```

## Testing
You can run the project's full test suite using Hardhat
```
npx hardhat test
```
Or a specific contract's tests e.g.
```
npx hardhat test test/ibco.js
```

## Coverage
Run the code coverage suite with
```
make cov
```

## Contract size benchmark
Run the contract sizer with
```
make size
```

## Technical Documentation
- [Stage 1](docs/stage-1)

## Deployment
There a few options for deploying the IBCO contracts.
### Deployment for frontend development
This script is deploys to a local fork of the mainnet, with "standard" parameters. It also prepares and activates the IBCO so that it is "customer-ready".

Firstly, follow [installation](#installation) and [mainnet fork setup](#mainnet-fork-setup).

Start a local network:
```
npx hardhat node
```
Run the frontend dev deployment script in the localhost network:
```
npx hardhat run --network localhost scripts/frontendReadyDeployment.js
```