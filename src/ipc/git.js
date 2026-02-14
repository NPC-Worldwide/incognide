const simpleGit = require('simple-git');
const { execSync } = require('child_process');

function register(ctx) {
  const { ipcMain, log } = ctx;

  ipcMain.handle('gitStatus', async (event, repoPath) => {
    log(`[Git] Getting status for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const status = await git.status();

      const allChangedFiles = status.files.map(f => {
        let fileStatus = '';
        let isStaged = false;
        let isUntracked = false;

        // Determine the primary status for display
        if (f.index === 'M') {
          fileStatus = 'Staged Modified'; // Modified in index
          isStaged = true;
        } else if (f.index === 'A') {
          fileStatus = 'Staged Added'; // Added to index
          isStaged = true;
        } else if (f.index === 'D') {
          fileStatus = 'Staged Deleted'; // Deleted from index
          isStaged = true;
        } else if (f.working_dir === 'M') {
          fileStatus = 'Modified'; // Modified in working directory, not staged
        } else if (f.working_dir === 'D') {
          fileStatus = 'Deleted'; // Deleted in working directory, not staged
        } else if (f.index === '??') {
          fileStatus = 'Untracked'; // Untracked file
          isUntracked = true;
        } else {
          fileStatus = 'Unknown Change'; // Fallback for any other types
        }

        return {
          path: f.path,
          status: fileStatus,
          isStaged: isStaged,
          isUntracked: isUntracked,
        };
      });

      return {
        success: true,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        // Filter based on the new structured 'allChangedFiles'
        staged: allChangedFiles.filter(f => f.isStaged),
        unstaged: allChangedFiles.filter(f => !f.isStaged && !f.isUntracked),
        untracked: allChangedFiles.filter(f => f.isUntracked),
        hasChanges: allChangedFiles.length > 0
      };
    } catch (err) {
      console.error(`[Git] Error getting status for ${repoPath}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitStageFile', async (event, repoPath, file) => {
    log(`[Git] Staging file: ${file} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.add(file);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error staging file ${file} in ${repoPath}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitUnstageFile', async (event, repoPath, file) => {
    log(`[Git] Unstaging file: ${file} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.reset([file]); // 'git reset <file>' unstages it
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error unstaging file ${file} in ${repoPath}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitCommit', async (event, repoPath, message) => {
    log(`[Git] Committing with message: "${message}" in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const commitResult = await git.commit(message);
      return { success: true, commit: commitResult.commit };
    } catch (err) {
      console.error(`[Git] Error committing in ${repoPath}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitPull', async (event, repoPath) => {
    log(`[Git] Pulling changes for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const pullResult = await git.pull();
      return { success: true, summary: pullResult };
    } catch (err) {
      console.error(`[Git] Error pulling in ${repoPath}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitPush', async (event, repoPath) => {
    log(`[Git] Pushing changes for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const pushResult = await git.push();
      return { success: true, summary: pushResult };
    } catch (err) {
      console.error(`[Git] Error pushing in ${repoPath}:`, err);
      const msg = err.message || '';
      // Check if it's the "no upstream branch" error
      const isNoUpstream = msg.includes('has no upstream branch');
      if (isNoUpstream) {
        // Get current branch name
        const git = simpleGit(repoPath);
        const branchResult = await git.branch();
        const currentBranch = branchResult.current;
        return {
          success: false,
          error: msg,
          noUpstream: true,
          currentBranch,
          suggestedCommand: `git push --set-upstream origin ${currentBranch}`
        };
      }
      // Check if push was rejected because remote has new commits
      const isRejected = msg.includes('rejected') || msg.includes('fetch first') || msg.includes('non-fast-forward');
      if (isRejected) {
        return {
          success: false,
          error: msg,
          rejected: true
        };
      }
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('gitPushSetUpstream', async (event, repoPath, branch) => {
    log(`[Git] Pushing with upstream for: ${repoPath}, branch: ${branch}`);
    try {
      const git = simpleGit(repoPath);
      const pushResult = await git.push(['--set-upstream', 'origin', branch]);
      return { success: true, summary: pushResult };
    } catch (err) {
      console.error(`[Git] Error pushing with upstream:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitSetAutoSetupRemote', async (event) => {
    log(`[Git] Setting push.autoSetupRemote to true`);
    try {
      execSync('git config --global push.autoSetupRemote true');
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error setting autoSetupRemote:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git diff for a file
  ipcMain.handle('gitDiff', async (event, repoPath, filePath, staged = false) => {
    log(`[Git] Getting diff for: ${filePath} in ${repoPath} (staged: ${staged})`);
    try {
      const git = simpleGit(repoPath);
      let diff;
      if (staged) {
        diff = await git.diff(['--cached', '--', filePath]);
      } else if (filePath) {
        diff = await git.diff(['--', filePath]);
      } else {
        diff = await git.diff();
      }
      return { success: true, diff };
    } catch (err) {
      console.error(`[Git] Error getting diff:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git diff for all changes
  ipcMain.handle('gitDiffAll', async (event, repoPath) => {
    log(`[Git] Getting all diffs for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const stagedDiff = await git.diff(['--cached']);
      const unstagedDiff = await git.diff();
      return { success: true, staged: stagedDiff, unstaged: unstagedDiff };
    } catch (err) {
      console.error(`[Git] Error getting diffs:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git blame for a file
  ipcMain.handle('gitBlame', async (event, repoPath, filePath) => {
    log(`[Git] Getting blame for: ${filePath} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      // Use raw to get blame output
      const blameOutput = await git.raw(['blame', '--line-porcelain', filePath]);

      // Parse the porcelain output
      const lines = blameOutput.split('\n');
      const blameData = [];
      let currentEntry = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^[0-9a-f]{40}/)) {
          if (currentEntry.hash) {
            blameData.push(currentEntry);
          }
          const parts = line.split(' ');
          currentEntry = {
            hash: parts[0],
            originalLine: parseInt(parts[1]),
            finalLine: parseInt(parts[2]),
          };
        } else if (line.startsWith('author ')) {
          currentEntry.author = line.substring(7);
        } else if (line.startsWith('author-time ')) {
          currentEntry.timestamp = parseInt(line.substring(12)) * 1000;
        } else if (line.startsWith('summary ')) {
          currentEntry.summary = line.substring(8);
        } else if (line.startsWith('\t')) {
          currentEntry.content = line.substring(1);
        }
      }
      if (currentEntry.hash) {
        blameData.push(currentEntry);
      }

      return { success: true, blame: blameData };
    } catch (err) {
      console.error(`[Git] Error getting blame:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git branches
  ipcMain.handle('gitBranches', async (event, repoPath) => {
    log(`[Git] Getting branches for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const branchSummary = await git.branch(['-a']);
      return {
        success: true,
        current: branchSummary.current,
        branches: branchSummary.all,
        local: branchSummary.branches
      };
    } catch (err) {
      console.error(`[Git] Error getting branches:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git create branch
  ipcMain.handle('gitCreateBranch', async (event, repoPath, branchName) => {
    log(`[Git] Creating branch: ${branchName} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.checkoutLocalBranch(branchName);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error creating branch:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git switch branch
  ipcMain.handle('gitCheckout', async (event, repoPath, branchName) => {
    log(`[Git] Switching to branch: ${branchName} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.checkout(branchName);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error switching branch:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git delete branch
  ipcMain.handle('gitDeleteBranch', async (event, repoPath, branchName, force = false) => {
    log(`[Git] Deleting branch: ${branchName} in ${repoPath} (force: ${force})`);
    try {
      const git = simpleGit(repoPath);
      await git.deleteLocalBranch(branchName, force);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error deleting branch:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git commit history
  ipcMain.handle('gitLog', async (event, repoPath, options = {}) => {
    log(`[Git] Getting commit history for: ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const logOptions = {
        maxCount: options.maxCount || 50,
        ...options
      };
      const logResult = await git.log(logOptions);
      return { success: true, commits: logResult.all, total: logResult.total };
    } catch (err) {
      console.error(`[Git] Error getting log:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git show commit details
  ipcMain.handle('gitShowCommit', async (event, repoPath, commitHash) => {
    log(`[Git] Showing commit: ${commitHash} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      // Use raw to avoid pager issues
      const show = await git.raw(['show', commitHash, '--stat', '--format=fuller', '--no-color']);
      const diff = await git.raw(['show', commitHash, '--format=', '--no-color']);
      return { success: true, details: show, diff };
    } catch (err) {
      console.error(`[Git] Error showing commit:`, err);
      return { success: false, error: err.message };
    }
  });

  // Git stash
  ipcMain.handle('gitStash', async (event, repoPath, action = 'push', message = '') => {
    log(`[Git] Stash ${action} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      let result;
      switch (action) {
        case 'push':
          result = message ? await git.stash(['push', '-m', message]) : await git.stash(['push']);
          break;
        case 'pop':
          result = await git.stash(['pop']);
          break;
        case 'list':
          result = await git.stash(['list']);
          break;
        case 'drop':
          result = await git.stash(['drop']);
          break;
        default:
          result = await git.stash([action]);
      }
      return { success: true, result };
    } catch (err) {
      console.error(`[Git] Error with stash:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitShowFile', async (event, repoPath, filePath, ref = 'HEAD') => {
    log(`[Git] Show file ${filePath} at ${ref} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      const content = await git.show([`${ref}:${filePath}`]);
      return { success: true, content };
    } catch (err) {
      // File might not exist at that ref (new file)
      if (err.message.includes('does not exist') || err.message.includes('fatal:')) {
        return { success: true, content: '' };
      }
      console.error(`[Git] Error showing file:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitDiscardFile', async (event, repoPath, filePath) => {
    log(`[Git] Discard changes to ${filePath} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.checkout(['--', filePath]);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error discarding file:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAcceptOurs', async (event, repoPath, filePath) => {
    log(`[Git] Accept ours for ${filePath} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.checkout(['--ours', filePath]);
      await git.add(filePath);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error accepting ours:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAcceptTheirs', async (event, repoPath, filePath) => {
    log(`[Git] Accept theirs for ${filePath} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.checkout(['--theirs', filePath]);
      await git.add(filePath);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error accepting theirs:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitMarkResolved', async (event, repoPath, filePath) => {
    log(`[Git] Mark resolved ${filePath} in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.add(filePath);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error marking resolved:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAbortMerge', async (event, repoPath) => {
    log(`[Git] Abort merge in ${repoPath}`);
    try {
      const git = simpleGit(repoPath);
      await git.merge(['--abort']);
      return { success: true };
    } catch (err) {
      console.error(`[Git] Error aborting merge:`, err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
