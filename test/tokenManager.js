const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('TokenManager', async () => {
    const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
    const WETH_ADDRESS = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
    const WETH_USD_CL = '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D';
    const WETH_CL_DEC = 8;
    const DAI = ethers.utils.formatBytes32String('DAI');
    const DAI_ADDRESS = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
    const DAI_USD_CL = '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D';
    const DAI_CL_DEC = 8;
    let TokenManager, owner, user;

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();
        const TokenManagerContract = await ethers.getContractFactory('TokenManager');
        TokenManager = await TokenManagerContract.deploy();
    });

    it('gets list of accepted tokens', async () => {
        await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);
        const acceptedTokens = await TokenManager.getAcceptedTokens();

        const tokens = [WETH_BYTES, DAI];
        expect(acceptedTokens).to.eql(tokens);
    });

    it('gets token details by name', async () => {
        const acceptedTokens = await TokenManager.get(WETH_BYTES);

        expect(acceptedTokens.addr).to.equal(WETH_ADDRESS);
        expect(acceptedTokens.chainlinkAddr).to.equal(WETH_USD_CL);
        expect(acceptedTokens.chainlinkDec).to.equal(WETH_CL_DEC);
    });

    describe('adding tokens', async () => {
        const DAI_CL_DEC = 8;

        it('allows owner to add new token', async () => {
            await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);
            const acceptedTokens = await TokenManager.getAcceptedTokens();

            const tokens = [WETH_BYTES, DAI];
            expect(acceptedTokens).to.eql(tokens);
        });

        it('does not allow non-owner to add token', async () => {
            const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);
            await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

            const acceptedTokens = await TokenManager.getAcceptedTokens();
            const tokens = [WETH_BYTES];
            expect(acceptedTokens).to.eql(tokens);
        });
    });

    describe('removing tokens', async () => {

        it('allows owner to remove new token', async () => {
            await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);
            expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

            await TokenManager.connect(owner).removeAcceptedToken(DAI);
            expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES]);
        });

        it('does not allow non-owner to remove token', async () => {
            await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);
            expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

            const removeToken = TokenManager.connect(user).removeAcceptedToken(DAI);
            await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
            expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);
        });
    });
});