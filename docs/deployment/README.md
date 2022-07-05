# Deployment
There a few options for deploying the IBCO contracts.
## Deployment for frontend development
This script deploys to a local fork of the mainnet, with standard parameters. It prepares and activates the IBCO, so that it is open and ready to use. It also mints the local accounts with the dummy USDT and TST tokens.

Firstly, follow [installation](../../README.md#installation) and [mainnet fork setup](../../README.md#mainnet-fork-setup).

Start a local network:
```
npx hardhat node
```
The local signer accounts, their addresses and private keys will be listed in the console for you to import to your browser wallet.

Run the frontend dev deployment script in the localhost network:
```
npx hardhat run --network localhost scripts/frontendReadyDeployment.js
```
Compilation artifacts e.g. ABIs will be created in the `artifacts` directory. All the contract addresses, as well as the address of the contract owner and the chain ID of the blockchain, will be saved to `scripts/frontendDeploymentArtifact.json`.
