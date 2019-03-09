const { NeutralExitError, logger, sleep } = require("./common");

async function merge(octokit, pullRequest, head) {
  await waitPullRequestState(octokit, pullRequest, head);

  try {
    await octokit.pulls.merge({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      number: pullRequest.number,
      sha: head,
      merge_method: "merge"
    });
  } catch (e) {
    logger.info("Failed to merge PR:", e.message);
    throw new NeutralExitError();
  }

  logger.info("PR successfully merged!");

  const { data: branch } = await octokit.repos.getBranch({
    owner: pullRequest.head.repo.owner.login,
    repo: pullRequest.head.repo.name,
    branch: pullRequest.head.ref
  });

  logger.trace("Branch:", branch);

  if (branch.protected) {
    logger.info("Branch is protected and cannot be deleted:", branch.name);
  } else {
    logger.debug("Deleting branch", branch.name, "...");
    await octokit.git.deleteRef({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      ref: `heads/${branch.name}`
    });

    logger.info("Merged branch has been deleted:", branch.name);
  }
}

async function waitPullRequestState(octokit, pullRequest, head) {
  if (pullRequest.mergeable_state === "clean") {
    return;
  }

  logger.info("PR not ready to be merged!");

  const retries = 3;
  for (let retry = 1; retry <= retries; retry++) {
    await sleep(10000);

    logger.info(`Retrying ${retry}/${retries} ...`);

    logger.debug("Getting latest PR data...");
    const { data: pr } = await octokit.pulls.get({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      number: pullRequest.number
    });

    if (head !== pr.head.sha) {
      logger.info("PR does not match HEAD:", pr.head.sha, "!=", head);
      throw new NeutralExitError();
    }

    if (pr.mergeable_state === "clean") {
      logger.info("PR is ready:", pr.mergeable_state);
      return;
    }
  }

  logger.info("PR not ready to be merged after", retries, "tries");
  throw new NeutralExitError();
}

module.exports = { merge };
