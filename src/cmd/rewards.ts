import { confirm, search } from "@inquirer/prompts";
import { Command, Option } from "clipanion";
import { loadAllData, storeData } from "src/lib/load.js";
import {
  acceptRewardRoot,
  createRewards,
  setRootUpdater,
  updateRewardRoot,
  setTimelock,
  getPendingRoot,
  getPendingRootWithTimestamp,
  getTimelock,
  getOwner,
  transferOwnership,
} from "src/lib/rewards.js";
import { getChain, getRpc, getTransport } from "src/lib/rpc.js";
import { MorphoRewardProgram } from "src/lib/types.js";
import {
  createWalletClient,
  getAddress,
  Hex,
  isAddress,
  isHash,
  keccak256,
  toHex,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const prodPublisher = "0xCa3D836E100Aca076991bF9abaA4F7516e5155Cb";
const devPublishers = [
  "0xA8F5d96E2DDfb5ec3F24B960A5a44EbC620064A3",
  "0xbF56E691851FdbEa83C670Cb365c2c1AFA1E58ca",
  "0xe4306ad21A29f9EdcfA9fA584e379A8D0D1463BB",
];
const selectReward = async (dir: string, id: string | undefined, action: string | undefined) => {
  const rewards = await loadAllData(dir, "rewards");
  const reward =
    id === undefined
      ? await search({
        message: `Select a campaign${action ? ` to ${action} for` : ""}:`,
        source: async (input) => {
          return rewards
            .filter((r) => r.id.includes(input || ""))
            .map((r) => ({
              name: `${r.id} - (${r.name})`,
              value: r,
            }));
        },
      })
      : rewards.find((r) => r.id === id);
  return { reward, rewards };
};

const loadBlacklist = (dir: string, chainId: number): string[] => {
  try {
    const blacklistPath = join(dir, chainId.toString(), "blacklist", "users", "data.json");
    const blacklistData = JSON.parse(readFileSync(blacklistPath, "utf8"));
    return blacklistData.blacklist?.map((addr: string) => addr.toLowerCase()) || [];
  } catch (error) {
    return [];
  }
};

const getWalletInfo = (chainString: string | number) => {
  const chain = getChain(chainString);
  if (!("urdFactory" in chain.morpho)) {
    throw new Error(`No urdFactory for chain ${chain.id}`);
  }
  const publicClient = getRpc(chain.id);
  const transport = getTransport(chain.id);
  const private_key = process.env.ETHEREUM_PRIVATE_KEY;
  if (!private_key) {
    throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var");
  }
  const account = privateKeyToAccount(private_key as Hex);
  const walletClient = createWalletClient({
    account,
    transport,
  });
  return { publicClient, walletClient, account, chain };
};

export class CreateRewardsCommand extends Command {
  static paths = [["reward", "deploy"]];

  chain = Option.String();
  id = Option.String();
  hashPrefix = Option.String("--hash-prefix", "oku:v0.0.0");
  dir = Option.String("--dir", "chains");

  prod = Option.Boolean("--prod", false);

  async execute() {
    const { chain, publicClient, walletClient } = getWalletInfo(this.chain);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    // load all the rewards to make sure the id is not a duplicate
    const rewards = await loadAllData(this.dir, "rewards");
    const rewardIds = new Set(rewards.map((r) => r.id));
    if (rewardIds.has(this.id)) {
      throw new Error(`Reward id ${this.id} already exists. try 'reward list'`);
    }

    const saltHash = keccak256(toHex(`${this.hashPrefix}:${this.id}`));
    let timelock = 0;
    if (this.prod) {
      timelock = 3 * 24 * 60 * 60;
    }

    const urdAddress = await createRewards(
      publicClient,
      walletClient,
      BigInt(timelock),
      saltHash,
      chain.morpho.urdFactory,
    );
    if (this.prod) {
      //// ended here
      const txnhash = await setRootUpdater(
        publicClient,
        walletClient,
        getAddress(urdAddress),
        getAddress(prodPublisher),
        true,
      );
      console.log(
        `set prod publisher ${prodPublisher} for urd ${urdAddress}. txn hash: ${txnhash}`,
      );
      // TODO: ownership transfer to the multisig
    } else {
      for (const devPublisher of devPublishers) {
        const txnSetDevPublisher = await setRootUpdater(
          publicClient,
          walletClient,
          getAddress(urdAddress),
          getAddress(devPublisher),
          true,
        );
        console.log(
          `set dev publisher ${devPublisher} for urd ${urdAddress}. txn hash: ${txnSetDevPublisher}`,
        );
      }
      if (!devPublishers.includes(walletClient.account.address)) {
        const txnSetOwnerPublisher = await setRootUpdater(
          publicClient,
          walletClient,
          getAddress(urdAddress),
          getAddress(walletClient.account.address),
          true,
        );
        console.log(
          `set owner publisher ${walletClient.account.address} for urd ${urdAddress}. txn hash: ${txnSetOwnerPublisher}`,
        );
      }
    }
    //
    console.log(`deployed a new urd to ${urdAddress}`);
    let rewardProgram: z.infer<typeof MorphoRewardProgram> = {
      id: this.id,
      salt: saltHash,
      urdAddress: urdAddress.toLowerCase(),
      chainId: chain.id,
      start_timestamp: 1751385600,
      end_timestamp: 1752595200,
      production: this.prod,
      reward_amount: "81269810000000000000000",
      reward_token: "0x9Cf9F00F3498c2ac856097087e041523dfdD71fF",
      name: this.id,
      type: "market",
      market:
        "0x2547ba491a7ff9e8cfcaa3e1c0da739f4fdc1be9fe4a37bfcdf570002153a0de",
    };
    const writtenFile = storeData(
      this.dir,
      chain.id.toString(),
      "rewards",
      rewardProgram.id,
      rewardProgram,
    );
    console.log(
      `wrote placeholder campaign to ${writtenFile}. please edit it/update it`,
    );
  }
}

export class ListRewardPrograms extends Command {
  static paths = [["reward", "list"]];

  dir = Option.String("--dir", "chains");
  root = Option.String("--root");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards");
    for (const reward of rewards) {
      console.log(
        `${reward.id}: (${reward.chainId}) ${reward.reward_amount} https://maizenet-explorer.usecorn.com/address/${reward.urdAddress}`,
      );
    }
  }
}

export class AcceptRewardRoot extends Command {
  static paths = [["reward", "accept"]];
  id = Option.String({ required: false });
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "accept root");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    const txnhash = await acceptRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
    );
    console.log(
      `updated root for urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}
export class UpdateRewardRoot extends Command {
  static paths = [["reward", "update"]];

  id = Option.String({ required: false });
  root = Option.String();
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "update root");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }

    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    if (!this.root || !isHash(this.root)) {
      throw new Error("root must be a hash");
    }
    const txnhash = await updateRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      this.root,
    );
    console.log(
      `updated root for urd ${reward.urdAddress} to ${this.root}. txn hash: ${txnhash}`,
    );
  }
}

export class AddRewardPublisher extends Command {
  static paths = [["reward", "add-publisher"]];

  id = Option.String({
    required: false,
  });
  publisher = Option.String();
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "add publisher");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { publicClient, walletClient } = getWalletInfo(reward.chainId);
    if (!this.publisher || !isAddress(this.publisher)) {
      throw new Error("publisher must be an address");
    }
    const txnhash = await setRootUpdater(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      getAddress(this.publisher),
      true,
    );
    console.log(
      `added publisher ${this.publisher} to urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}

export class SetTimelock extends Command {
  static paths = [["reward", "set-timelock"]];

  id = Option.String({
    required: false,
  });
  // 16 hours
  timelock = Option.String("--timelock", "57600");
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "set timelock");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    if (!this.timelock || isNaN(Number(this.timelock))) {
      throw new Error("timelock must be a number");
    }
    const txnhash = await setTimelock(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      BigInt(this.timelock),
    );
    console.log(
      `updated timelock for urd ${reward.urdAddress} to ${this.timelock}. txn hash: ${txnhash}`,
    );
  }
}

export class CheckPendingRoot extends Command {
  static paths = [["reward", "check"]];
  id = Option.String({ required: false });
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "check pending root");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    const pendingRoot = await getPendingRoot(
      publicClient,
      getAddress(reward.urdAddress),
    );

    // Get detailed pending root info and timelock
    const pendingRootData = await getPendingRootWithTimestamp(
      publicClient,
      getAddress(reward.urdAddress),
    );

    const timelockPeriod = await getTimelock(
      publicClient,
      getAddress(reward.urdAddress),
    );

    console.log(`Reward Program: ${reward.id} (${reward.name || "no name"})`);
    console.log(`Chain: ${reward.chainId}`);
    console.log(`URD Address: ${reward.urdAddress}`);
    console.log(`On-chain Pending Root: ${pendingRoot}`);

    try {
      const endpointUrl = `https://sap.icarus.tools/blue?method=getPendingTreeForCampaign&params=[%22${encodeURIComponent(reward.id)}%22]`;
      const response = await fetch(endpointUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const endpointData = await response.json();
      console.log(`Endpoint Response:`, JSON.stringify(endpointData, null, 2));

      if (endpointData && endpointData.result) {
        const campaignTree = endpointData.result;

        if (campaignTree.root) {
          const endpointRoot = campaignTree.root;
          console.log(`Endpoint Root: ${endpointRoot}`);
          console.log(`Campaign ID: ${campaignTree.id || 'N/A'}`);
          console.log(`Campaign Name: ${campaignTree.metadata?.name || 'N/A'}`);
          console.log(`Tree Entries: ${campaignTree.tree?.length || 0}`);

          if (pendingRoot.toLowerCase() === endpointRoot.toLowerCase()) {
            console.log("✅ Status: On-chain pending root matches endpoint root");
          } else {
            console.log("❌ Status: On-chain pending root does NOT match endpoint root");
            console.log(`  On-chain: ${pendingRoot}`);
            console.log(`  Endpoint: ${endpointRoot}`);
          }

          // Enhanced validation logic
          this.validateCampaignProgress(reward, campaignTree);

          // Blacklist validation
          this.validateBlacklist(campaignTree, reward.chainId);
        } else {
          console.log("⚠️  Endpoint did not return a root value in the campaign tree");
        }
      } else {
        console.log("⚠️  Endpoint did not return a valid campaign tree");
      }
    } catch (error) {
      console.log(`❌ Error calling endpoint: ${error instanceof Error ? error.message : error}`);
    }

    // Display timelock information at the bottom
    this.displayTimelockInfo(pendingRootData, timelockPeriod);

    // Update status messages based on timelock
    if (pendingRoot === zeroHash) {
      console.log("\nStatus: No pending root");
    } else {
      const validAtTimestamp = Number(pendingRootData.timestamp);
      const now = Math.floor(Date.now() / 1000);

      if (now >= validAtTimestamp) {
        console.log("\n✅ Status: Pending root available and ready to accept");
        console.log("Use 'reward accept' to accept this pending root");
      } else {
        console.log("\n⏳ Status: Pending root available but still in timelock");
        const timeRemaining = validAtTimestamp - now;
        const hoursRemaining = Math.floor(timeRemaining / 3600);
        const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);
        console.log(`Cannot accept for ${hoursRemaining}h ${minutesRemaining}m more`);
      }
    }
  }

  private validateCampaignProgress(reward: any, campaignTree: any) {
    console.log("\n🔍 Campaign Progress Validation:");

    // Calculate the most recent Friday at 9am PDT
    const referenceTime = this.getMostRecentFriday9amPDT();
    const startTime = campaignTree.metadata?.start_timestamp || reward.start_timestamp;
    const endTime = campaignTree.metadata?.end_timestamp || reward.end_timestamp;
    const totalRewardAmount = BigInt(reward.reward_amount);

    console.log(`📅 Using reference time: ${new Date(referenceTime * 1000).toISOString()} (Most recent Friday 9pm PDT - 12hrs after 9am)`);

    // Calculate campaign completion percentage
    let completionPercentage = 0;
    if (referenceTime < startTime) {
      completionPercentage = 0;
      console.log("⏳ Campaign has not started yet (as of reference time)");
    } else if (referenceTime >= endTime) {
      completionPercentage = 100;
      console.log("✅ Campaign has ended (as of reference time)");
    } else {
      const elapsed = referenceTime - startTime;
      const total = endTime - startTime;
      completionPercentage = (elapsed / total) * 100;
      console.log(`⏱️ Campaign is ${completionPercentage.toFixed(2)}% complete (as of reference time)`);
    }

    // Validate total claimable amount
    if (campaignTree.tree && Array.isArray(campaignTree.tree)) {
      const totalClaimable = campaignTree.tree.reduce((sum: bigint, entry: any) => {
        return sum + BigInt(entry.claimable || entry.amount || 0);
      }, BigInt(0));

      const expectedMax = (totalRewardAmount * BigInt(Math.ceil(completionPercentage))) / BigInt(100);
      const claimablePercentage = Number((totalClaimable * BigInt(10000)) / totalRewardAmount) / 100;

      console.log(`💰 Total claimable: ${totalClaimable.toString()} (${claimablePercentage.toFixed(2)}% of total reward)`);
      console.log(`📊 Expected max claimable: ${expectedMax.toString()} (${completionPercentage.toFixed(2)}% of total reward)`);

      // Validation with some tolerance (allowing up to 5% over expected)
      const tolerance = BigInt(5); // 5%
      const maxAllowed = (totalRewardAmount * (BigInt(Math.ceil(completionPercentage)) + tolerance)) / BigInt(100);

      if (totalClaimable <= maxAllowed) {
        console.log("✅ Total claimable amount is within expected range");
      } else {
        console.log("⚠️  Total claimable amount exceeds expected range");
        const excessPercentage = Number(((totalClaimable - expectedMax) * BigInt(10000)) / totalRewardAmount) / 100;
        console.log(`   Excess: ${excessPercentage.toFixed(2)}% over expected`);
      }

      // Calculate and display top 5 users' claimable percentages
      this.displayTopUsersAnalysis(campaignTree.tree, totalRewardAmount);
    } else {
      console.log("⚠️  No tree data available for validation");
    }

    // Display campaign timing info
    console.log(`\n📅 Campaign Timeline:`);
    console.log(`   Start: ${new Date(startTime * 1000).toISOString()}`);
    console.log(`   End: ${new Date(endTime * 1000).toISOString()}`);
    console.log(`   Reference: ${new Date(referenceTime * 1000).toISOString()}`);
  }

  private getMostRecentFriday9amPDT(): number {
    // Get current date in PDT (UTC-7)
    const now = new Date();
    const pdtOffset = 7 * 60; // PDT is UTC-7
    const nowPDT = new Date(now.getTime() - pdtOffset * 60 * 1000);

    // Get current day of week (0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday)
    const currentDay = nowPDT.getDay();

    // Calculate days to subtract to get to most recent Friday
    let daysToSubtract = 0;
    if (currentDay === 5) { // Friday
      daysToSubtract = 0; // Use today
    } else if (currentDay === 6) { // Saturday
      daysToSubtract = 1; // Use yesterday (Friday)
    } else if (currentDay === 0) { // Sunday
      daysToSubtract = 2; // Use 2 days ago (Friday)
    } else { // Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
      daysToSubtract = currentDay + 2; // Mon=3, Tue=4, Wed=5, Thu=6 days ago
    }

    // Create the target Friday date
    const targetFriday = new Date(nowPDT);
    targetFriday.setDate(targetFriday.getDate() - daysToSubtract);

    // Set to 9am PDT
    targetFriday.setHours(9, 0, 0, 0);

    // Subtract 12 hours (9am PDT becomes 9pm PDT the previous day)
    targetFriday.setHours(targetFriday.getHours() - 12);

    // Convert back to UTC and return as Unix timestamp
    const fridayUTC = new Date(targetFriday.getTime() + pdtOffset * 60 * 1000);
    return Math.floor(fridayUTC.getTime() / 1000);
  }

  private displayTimelockInfo(pendingRootData: any, timelockPeriod: bigint) {
    console.log(`\n🔒 Timelock Information:`);
    console.log(`   Timelock Period: ${timelockPeriod.toString()} seconds (${Number(timelockPeriod) / 3600} hours)`);

    if (pendingRootData.root === zeroHash) {
      console.log(`   Status: No pending root to timelock`);
      return;
    }

    const validAtTimestamp = Number(pendingRootData.timestamp);
    const submittedAtTimestamp = validAtTimestamp - Number(timelockPeriod);
    const now = Math.floor(Date.now() / 1000);

    console.log(`   Pending Root Set At: ${new Date(submittedAtTimestamp * 1000).toISOString()}`);
    console.log(`   Timelock Expires At: ${new Date(validAtTimestamp * 1000).toISOString()}`);

    if (now >= validAtTimestamp) {
      console.log(`   ✅ Status: Ready to accept! (Timelock expired)`);
      const expiredSince = now - validAtTimestamp;
      const hoursExpired = Math.floor(expiredSince / 3600);
      const minutesExpired = Math.floor((expiredSince % 3600) / 60);
      console.log(`   📅 Expired: ${hoursExpired}h ${minutesExpired}m ago`);
    } else {
      console.log(`   ⏳ Status: Still locked`);
      const timeRemaining = validAtTimestamp - now;
      const hoursRemaining = Math.floor(timeRemaining / 3600);
      const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);
      console.log(`   ⏱️ Time Remaining: ${hoursRemaining}h ${minutesRemaining}m`);
      console.log(`   🕐 Ready At: ${new Date(validAtTimestamp * 1000).toLocaleString()}`);
    }
  }

  private displayTopUsersAnalysis(tree: any[], totalRewardAmount: bigint) {
    console.log("\n👥 Top 5 Users Analysis:");

    // Sort users by claimable amount (descending)
    const sortedUsers = tree
      .map(entry => ({
        user: entry.account || entry.user || entry.address || 'Unknown',
        claimable: BigInt(entry.claimable || entry.amount || 0)
      }))
      .sort((a, b) => {
        if (a.claimable > b.claimable) return -1;
        if (a.claimable < b.claimable) return 1;
        return 0;
      })
      .slice(0, 5);

    const topFiveTotal = sortedUsers.reduce((sum, user) => sum + user.claimable, BigInt(0));
    const topFivePercentage = Number((topFiveTotal * BigInt(10000)) / totalRewardAmount) / 100;

    console.log(`🏆 Top 5 users control ${topFivePercentage.toFixed(2)}% of total rewards`);

    sortedUsers.forEach((user, index) => {
      const userPercentage = Number((user.claimable * BigInt(10000)) / totalRewardAmount) / 100;
      console.log(`   ${index + 1}. ${user.user}: ${user.claimable.toString()} (${userPercentage.toFixed(2)}%)`);
    });

    // Analysis of concentration
    if (topFivePercentage > 50) {
      console.log("⚠️  High concentration: Top 5 users control >50% of rewards");
    } else if (topFivePercentage > 25) {
      console.log("ℹ️  Moderate concentration: Top 5 users control >25% of rewards");
    } else {
      console.log("✅ Good distribution: Top 5 users control <25% of rewards");
    }
  }

  private validateBlacklist(campaignTree: any, chainId: number) {
    console.log("\n🚫 Blacklist Validation:");

    // Load blacklist for the specific chain
    const blacklist = loadBlacklist(this.dir, chainId);

    if (blacklist.length === 0) {
      console.log("ℹ️  No blacklist found for this chain");
      return;
    }

    console.log(`📋 Loaded blacklist with ${blacklist.length} addresses for chain ${chainId}`);

    if (!campaignTree.tree || !Array.isArray(campaignTree.tree)) {
      console.log("⚠️  No tree data available for blacklist validation");
      return;
    }

    // Check for blacklisted addresses in the tree
    for (const entry of campaignTree.tree) {
      const userAddress = (entry.account || entry.user || entry.address || '').toLowerCase();
      if (blacklist.includes(userAddress)) {
        console.log("\n🔥🔥🔥 CRITICAL ERROR: BLACKLISTED ADDRESS DETECTED 🔥🔥🔥");
        console.log("❌❌❌ DO NOT ACCEPT THIS ROOT - CONTAINS SANCTIONED USER ❌❌❌");
        console.log(`🚨 Blacklisted address found: ${userAddress}`);
        console.log("🛑 ABORTING VALIDATION - MANUAL REVIEW REQUIRED 🛑");
        return;
      }
    }

    console.log("✅ No blacklisted addresses found in pending root");
  }
}

export class ListPendingRoots extends Command {
  static paths = [["reward", "pending"]];
  dir = Option.String("--dir", "chains");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards");
    console.log("Checking all rewards for pending roots...\n");

    let foundPending = false;

    for (const reward of rewards) {
      try {
        const { chain, publicClient } = getWalletInfo(reward.chainId);

        if (!("urdFactory" in chain.morpho)) {
          console.log(`⚠️  Skipping ${reward.id}: No urdFactory for chain ${chain.id}`);
          continue;
        }

        const pendingRoot = await getPendingRoot(
          publicClient,
          getAddress(reward.urdAddress),
        );

        if (pendingRoot !== zeroHash) {
          foundPending = true;

          const pendingRootData = await getPendingRootWithTimestamp(
            publicClient,
            getAddress(reward.urdAddress),
          );

          const timelockPeriod = await getTimelock(
            publicClient,
            getAddress(reward.urdAddress),
          );

          const validAtTimestamp = Number(pendingRootData.timestamp);
          const now = Math.floor(Date.now() / 1000);
          const timeRemaining = validAtTimestamp - now;

          console.log(`🔄 ${reward.id} (${reward.name || "no name"})`);
          console.log(`   Chain: ${reward.chainId}`);
          console.log(`   URD: ${reward.urdAddress}`);
          console.log(`   Pending Root: ${pendingRoot}`);

          if (now >= validAtTimestamp) {
            console.log(`   ✅ Status: Ready to accept! (expired ${Math.floor((now - validAtTimestamp) / 3600)}h ago)`);
          } else {
            const hoursRemaining = Math.floor(timeRemaining / 3600);
            const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);
            console.log(`   ⏳ Status: Locked for ${hoursRemaining}h ${minutesRemaining}m more`);
          }
          console.log("");
        }
      } catch (error) {
        console.log(`❌ Error checking ${reward.id}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!foundPending) {
      console.log("✨ No rewards have pending roots.");
    }
  }
}

export class RepublishRoot extends Command {
  static paths = [["reward", "republish-root"]];
  id = Option.String({
    required: false,
  });
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "republish root");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);
    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    const pendingRoot = await getPendingRoot(
      publicClient,
      getAddress(reward.urdAddress),
    );
    const answer = await confirm({
      message: `Are you sure you want to republish the root for urd ${reward.urdAddress}? The pending root is ${pendingRoot}`,
    });
    if (!answer) {
      console.log("aborting");
      return;
    }
    const txnhash = await updateRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      pendingRoot,
      zeroHash,
    );
    console.log(
      `republished root for urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}

export class ShowRewardInfo extends Command {
  static paths = [["reward", "info"]];

  id = Option.String({ required: false });
  dir = Option.String("--dir", "chains");

  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "show info");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }

    const { chain, publicClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    console.log("=== Reward Campaign Information ===\n");

    console.log(`📋 Campaign Details:`);
    console.log(`   ID: ${reward.id}`);
    console.log(`   Name: ${reward.name || "No name specified"}`);
    console.log(`   Type: ${reward.type}`);
    console.log(`   Chain ID: ${reward.chainId}`);
    console.log(`   Production: ${reward.production ? "Yes" : "No"}`);
    console.log(`   Finished: ${reward.finished ? "Yes" : "No"}`);

    console.log(`\n📍 Addresses:`);
    console.log(`   URD Contract: ${reward.urdAddress}`);
    console.log(`   Reward Token: ${reward.reward_token}`);
    if (reward.vault) {
      console.log(`   Vault: ${reward.vault}`);
    }
    if (reward.market) {
      console.log(`   Market: ${reward.market}`);
    }

    console.log(`\n💰 Reward Details:`);
    console.log(`   Total Amount: ${reward.reward_amount}`);
    const rewardBigInt = BigInt(reward.reward_amount);
    const rewardFormatted = (Number(rewardBigInt) / 1e18).toFixed(2);
    console.log(`   Total Amount (formatted): ${rewardFormatted}`);

    console.log(`\n⏱️ Timeline:`);
    const startDate = new Date(reward.start_timestamp * 1000);
    const endDate = new Date(reward.end_timestamp * 1000);
    console.log(`   Start: ${startDate.toISOString()} (${reward.start_timestamp})`);
    console.log(`   End: ${endDate.toISOString()} (${reward.end_timestamp})`);

    const now = Date.now() / 1000;
    if (now < reward.start_timestamp) {
      const daysUntilStart = Math.ceil((reward.start_timestamp - now) / 86400);
      console.log(`   Status: Not started (starts in ${daysUntilStart} days)`);
    } else if (now > reward.end_timestamp) {
      const daysSinceEnd = Math.floor((now - reward.end_timestamp) / 86400);
      console.log(`   Status: Ended (${daysSinceEnd} days ago)`);
    } else {
      const elapsed = now - reward.start_timestamp;
      const total = reward.end_timestamp - reward.start_timestamp;
      const percentage = (elapsed / total) * 100;
      const daysRemaining = Math.ceil((reward.end_timestamp - now) / 86400);
      console.log(`   Status: Active (${percentage.toFixed(2)}% complete, ${daysRemaining} days remaining)`);
    }

    console.log(`\n🔧 Technical Details:`);
    console.log(`   Salt: ${reward.salt}`);

    try {
      const pendingRoot = await getPendingRoot(
        publicClient,
        getAddress(reward.urdAddress),
      );

      const pendingRootData = await getPendingRootWithTimestamp(
        publicClient,
        getAddress(reward.urdAddress),
      );

      const timelockPeriod = await getTimelock(
        publicClient,
        getAddress(reward.urdAddress),
      );

      const owner = await getOwner(
        publicClient,
        getAddress(reward.urdAddress),
      );

      console.log(`\n📊 On-chain State:`);
      console.log(`   Owner: ${owner}`);
      console.log(`   Pending Root: ${pendingRoot}`);
      console.log(`   Timelock Period: ${timelockPeriod.toString()} seconds (${Number(timelockPeriod) / 3600} hours)`);

      if (pendingRoot !== zeroHash) {
        const validAtTimestamp = Number(pendingRootData.timestamp);
        const currentTime = Math.floor(Date.now() / 1000);

        if (currentTime >= validAtTimestamp) {
          console.log(`   Root Status: ✅ Ready to accept`);
        } else {
          const timeRemaining = validAtTimestamp - currentTime;
          const hoursRemaining = Math.floor(timeRemaining / 3600);
          const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);
          console.log(`   Root Status: ⏳ In timelock (${hoursRemaining}h ${minutesRemaining}m remaining)`);
        }

        if (pendingRootData.ipfs && pendingRootData.ipfs !== zeroHash) {
          console.log(`   IPFS Hash: ${pendingRootData.ipfs}`);
        }
      } else {
        console.log(`   Root Status: No pending root`);
      }

    } catch (error) {
      console.log(`\n⚠️ Could not fetch on-chain data: ${error instanceof Error ? error.message : error}`);
    }

    console.log(`\n🔗 Links:`);
    console.log(`   Explorer: https://maizenet-explorer.usecorn.com/address/${reward.urdAddress}`);
  }
}

export class TransferOwner extends Command {
  static paths = [["reward", "transfer-owner"]];

  id = Option.String({ required: false });
  newOwner = Option.String();
  dir = Option.String("--dir", "chains");

  async execute() {
    const { reward } = await selectReward(this.dir, this.id, "transfer ownership");
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }

    if (!this.newOwner || !isAddress(this.newOwner)) {
      throw new Error("new-owner must be a valid address");
    }

    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    // Get current owner
    const currentOwner = await getOwner(
      publicClient,
      getAddress(reward.urdAddress),
    );

    console.log(`\n⚠️  WARNING: Ownership Transfer`);
    console.log(`Campaign: ${reward.id} (${reward.name || "no name"})`);
    console.log(`URD Contract: ${reward.urdAddress}`);
    console.log(`Current Owner: ${currentOwner}`);
    console.log(`New Owner: ${this.newOwner}`);
    console.log(`\n🚨 This action is IRREVERSIBLE!`);

    const answer = await confirm({
      message: `Are you absolutely sure you want to transfer ownership to ${this.newOwner}?`,
      default: false,
    });

    if (!answer) {
      console.log("Transfer cancelled");
      return;
    }

    // Double confirmation for safety
    const secondAnswer = await confirm({
      message: `FINAL CONFIRMATION: Transfer ownership of ${reward.id} to ${this.newOwner}?`,
      default: false,
    });

    if (!secondAnswer) {
      console.log("Transfer cancelled");
      return;
    }

    try {
      const txnhash = await transferOwnership(
        publicClient,
        walletClient,
        getAddress(reward.urdAddress),
        getAddress(this.newOwner),
      );

      console.log(`\n✅ Ownership transferred successfully!`);
      console.log(`Transaction hash: ${txnhash}`);
      console.log(`New owner: ${this.newOwner}`);

      // Verify the transfer
      const newOwnerVerified = await getOwner(
        publicClient,
        getAddress(reward.urdAddress),
      );

      if (newOwnerVerified.toLowerCase() === this.newOwner.toLowerCase()) {
        console.log(`✅ Ownership transfer verified on-chain`);
      } else {
        console.log(`⚠️  Warning: Could not verify ownership transfer. Please check manually.`);
      }
    } catch (error) {
      console.log(`\n❌ Transfer failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }
}
