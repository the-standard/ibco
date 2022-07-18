// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
// import "hardhat/console.sol";

contract Staking is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    bool public active;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public duration;
    uint256 public initialised;
    uint256 private minTST;

    address TST_ADDRESS;

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

    function activate(uint256 _start, uint256 _end, address _TST_ADDRESS) external onlyOwner {
        // CHORE needs refactor
        require(active == false, 'err-already-active');
        require(initialised == 0, 'err-already-initialised');
        require(_end > _start, 'err-start-end');
        require(_end >= block.timestamp, 'err-invalid-end');
       
        TST_ADDRESS = _TST_ADDRESS;
        startTime = _start;
        endTime = _end;
        duration = _end - _start;
        initialised = block.timestamp;
        
        // TODO variable
        minTST = 1 ether;
        
        active = true;
    }

    function disable() external onlyOwner {
        require(active, 'err-not-active');
        active = false;
    }

    function mint(uint256 _amount) external returns(uint256) {

        // CHORE needs refactor
        require(active == true, 'err-not-active');
        require(_amount >= minTST, 'err-not-min');
        require(block.timestamp >= startTime, 'err-not-started');
        require(block.timestamp < endTime, 'err-finished');
        require(active == true, 'err-not-active');

        IERC20 TOKEN = IERC20(TST_ADDRESS);

        TOKEN.transferFrom(msg.sender, address(this), _amount);
        // todo put the window in here

        uint256 newItemId = _tokenIds.current();
        _mint(msg.sender, newItemId);

        // TODO add to position

        _tokenIds.increment();
        return newItemId;
    }

    // function burn(uint256 tokenId) public {
    //     _burn(tokenId);
    // }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
        _;
    }
}
