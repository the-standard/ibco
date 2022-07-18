// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Staking is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    bool public active;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public duration;
    uint256 public initialised;

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

    function activate(uint256 _start, uint256 _end) external onlyOwner {
        require(active == false, 'err-already-active');
        require(initialised == 0, 'err-already-initialised');
        require(_end > _start, 'err-start-end');
        startTime = _start;
        endTime = _end;
        duration = endTime - startTime;
        initialised = block.timestamp;
        active = true;
    }
   
    function disable() external onlyOwner {
        require(active, 'err-not-active');
        active = false;
    }

    // function mint(address owner) public returns (uint256)
    // {
    //     uint256 newItemId = _tokenIds.current();
    //     _mint(owner, newItemId);

    //     _tokenIds.increment();
    //     return newItemId;
    // }

    // function burn(uint256 tokenId) public {
    //     _burn(tokenId);
    // }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
        _;
    }
}
