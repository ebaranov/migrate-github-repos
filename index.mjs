import path from 'path';
import dotenv from 'dotenv';
import shelljs from 'shelljs';
import axios from 'axios';
import pReflect from 'p-reflect';
import pEachSeries from 'p-each-series';

dotenv.config();

const PWD_PATH = process.cwd();
const PERSONAL_TOKEN = process.env.PERSONAL_TOKEN;
const ENTERPRISE_TOKEN = process.env.ENTERPRISE_TOKEN;

const personalGithubApi = axios.create({
  baseURL: 'https://api.github.com/',
  headers: {
    Authorization: `token ${PERSONAL_TOKEN}`,
  },
});
const enterpriseGithubApi = axios.create({
  baseURL: 'https://api.github.groupondev.com/',
  headers: {
    Authorization: `token ${ENTERPRISE_TOKEN}`,
  },
});

(async () => {
  let curPage = 1;
  let hasMore = true;
  let orderUpRepos = [];

  while (hasMore) {
    const { data: repos } = await personalGithubApi.get(`/orgs/orderup/repos`, {
      params: { page: curPage, per_page: 100 },
    });

    orderUpRepos = [...orderUpRepos, ...repos];

    curPage++;
    hasMore = repos.length === 100;
  }

  await pEachSeries(orderUpRepos, async (repo, idx) => {
    const repoLogToken = `${idx}:${repo.name}:${repo.id}`;
    console.log(`[${repoLogToken}] - START >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);

    console.log(`[${repoLogToken}] - create - start`);
    const { isFulfilled, reason } = await pReflect(
      enterpriseGithubApi.post(`/orgs/orderup/repos`, {
        name: repo.name,
        visibility: 'internal',
      }),
    );

    if (isFulfilled) {
      console.log(`[${repoLogToken}] - create - success`);
    } else {
      console.log(`[${repoLogToken}] - create - fail - ${reason.response.statusText}`);
      return;
    }

    shelljs.exec(`mkdir -p ${path.join(PWD_PATH, 'temp')}`);
    shelljs.cd(path.join(PWD_PATH, 'temp'));

    console.log(`[${repoLogToken}] - clone - start`);
    const cloneCmd = shelljs.exec(`git clone ${repo.clone_url}`);

    if (cloneCmd.code === 0) {
      console.log(`[${repoLogToken}] - clone - success`);
    } else {
      console.log(`[${repoLogToken}] - clone - fail`);
      console.log(`[${repoLogToken}] - FINISH <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
      return;
    }

    shelljs.cd(path.join(PWD_PATH, 'temp', repo.name));

    const remoteRepoUrl = `git@github.groupondev.com:orderup/${repo.name}.git`;
    console.log(`[${repoLogToken}] - add remote - ${remoteRepoUrl}`);
    shelljs.exec(`git remote add enterprise ${remoteRepoUrl}`);

    console.log(`[${repoLogToken}] - push remote - start`);
    const pushCmd = shelljs.exec(`git push enterprise --force --mirror`);

    if (pushCmd.code === 0) {
      console.log(`[${repoLogToken}] - push to remote - success`);
    } else {
      console.log(`[${repoLogToken}] - push to remote - fail`);

      console.log(`[${repoLogToken}] - FINISH <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
      return;
    }

    shelljs.cd(PWD_PATH);

    console.log(`[${repoLogToken}] - FINISH <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
  });

  shelljs.exec(`rm -rf ${PWD_PATH}/temp/*`);
})();
