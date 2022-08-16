const { ethers } = require('hardhat');
const { expect } = require('chai');
const crypto = require('crypto');

let user1, Directory, DirectoryContract;

beforeEach(async () => {
  let owner;
  [owner, user1] = await ethers.getSigners();
  DirectoryContract = await ethers.getContractFactory('StakingDirectory');
  Directory = await DirectoryContract.connect(owner).deploy();
});

function address() {
  var id = crypto.randomBytes(32).toString('hex');
  var privateKey = "0x"+id;
  var wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}

describe('StakingDirectory', async () => {
  it('adds an address to the directory', async () => {
    const addr1 = address();
    await Directory.add(addr1);

    let list = await Directory.list();
    await expect(list[0]).to.eq(addr1);

    await Directory.del(addr1);
    list = await Directory.list();
    await expect(list.length).to.eq(0);
  });

  it('tests ownership', async () => {
    const addr1 = address();

    const add = Directory.connect(user1).add(addr1);
    await expect(add).to.be.revertedWith('Ownable: caller is not the owner');
   
    const del = Directory.connect(user1).del(addr1);
    await expect(del).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
