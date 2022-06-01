const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('SEuro', async () => {
  let owner, admin, user, SEuro;

  beforeEach(async () => {
    [owner, admin, user] = await ethers.getSigners();
    const SEuroContract = await ethers.getContractFactory('SEuro');
    SEuro = await SEuroContract.connect(owner).deploy('SEuro', 'SEUR', [admin.address]);
  });

  describe('minting', async () => {
    it('mints seuros if owner', async () => {
      const toMint = ethers.utils.parseEther('1');
      await SEuro.connect(owner).mint(user.address, toMint);
      expect(await SEuro.balanceOf(user.address))
        .to.equal(toMint);
    });

    it('mints seuros if signer has minter role', async() => {
      const toMint = ethers.utils.parseEther('1');
      await SEuro.connect(admin).mint(user.address, toMint);
      expect(await SEuro.balanceOf(user.address))
        .to.equal(toMint);
    });

    it('does not mint if signer not owner or minter', async() => {
      const toMint = ethers.utils.parseEther('1');
      const mint = SEuro.connect(user).mint(user.address, toMint);
      await expect(mint).to.be.revertedWith('invalid-minter');
      expect(await SEuro.balanceOf(user.address))
        .to.equal('0');
    });
  });
});
