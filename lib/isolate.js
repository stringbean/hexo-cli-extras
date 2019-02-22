'use strict';

const Promise = require('bluebird');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fsStat = Promise.promisify(require('fs').stat);
const fsRename = Promise.promisify(require('fs').rename);
const fsMkdir = Promise.promisify(require('fs').mkdir);
const path = require('path');

module.exports = function modExports(args) {
  // set up -a/--all option and searchTerms
  const doWholeFolder = !!args.a || !!args.all;
  let searchTerms = [];

  if (!doWholeFolder) {
    searchTerms = args._.map((arg) => {
      return new RegExp(arg, 'i');
    });
  }

  this.load().then(() => {
    const locals = this.locals;
    const exileDir = path.join(this.source_dir, '_posts', '_exile');
    let allPosts;

    // if the _exile dir doesn't exist yet, make it
    isDir(exileDir).then((exists) => {
      if (!exists) {
        makeDir(exileDir);
      }
    }).then(() => {
      return getArticles(locals);
    }).then((arts) => {
      allPosts = arts;
      return selectIsolated(arts, doWholeFolder);
    }).then((isolated) => {
      // split into { isolated, articlesToStash }
      return makeIsoObject(allPosts, isolated);
    }).then((articlesObject) => {
      return doIsolate(articlesObject);
    }).then((isolated) => {
      console.log(chalk.gray(isolated), 'successfully isolated.\nTo restore the exiled posts, run', chalk.yellow('hexo integrate'));
    }).catch((err) => {
      console.log(err.stack ? chalk.red(err.stack) : chalk.gray(err));
    });

    function isDir(dir) {
      return fsStat(dir).then((stats) => {
        if (stats.isFile() && /_exile/.test(dir)) {
          console.log(chalk.gray(dir), 'seems to be a file on your filesystem! It needs to be either non-existent or a directory, so please rename your _exile post before using this command.');
          process.exit();
        } else if (stats.isDirectory()) {
          // console.log('%s is a directory', dir);
          return true;
        } else {
          console.log(chalk.gray(dir), 'seems to be neither a file nor a directory! This really shouldn\'t be happening, please issue a bug report.');
          process.exit();
        }
      }).catch(() => {
        // The directory doesn't exist (which is not a bad thing)
        // console.log('%s doesn\'t exist', dir);
        return false;
      });
    }

    function makeDir(dir) {
      return fsMkdir(dir).then(() => {
        console.log(chalk.gray(dir), 'created');
      }).catch((err) => {
        console.log(chalk.gray(dir), 'could not be created: ', chalk.red(err));
      });
    }

    function getArticles(data) {
      return Promise.resolve(data.get('posts').sort('-date').toArray());
    }

    function filterOnName(arts, terms) {
      return arts.filter((article) => {
        return terms.every((term) => {
          return term.test(article.title) || term.test(article.slug);
        });
      });
    }

    function selectIsolated(items, doAll) {
      // narrow down the post to isolate based on the user's inputted search terms (if available)
      const isolated = filterOnName(items, searchTerms);

      // stash everything if run with the -a/--all option
      if (doAll) {
        return Promise.resolve(isolated);
      }

      if (isolated.length === 0) {
        console.log(chalk.red('No posts matched. Exiting.'));
        process.exit();
      }

      if (isolated.length === 1) {
        return Promise.resolve(isolated[0].full_source);
      }

      // set up menu for selecting a post in case multiple match the search terms
      const entries = isolated.map((article) => {
        return [article.title, ' (', chalk.green(article.updated.format('YYYY-MM-DD')), ')'].join('');
      });

      return inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select the post you want to isolate.',
          choices: entries,
        },
      ]).then((answer) => {
        const pos = entries.indexOf(answer.selected);
        return isolated[pos].full_source;
      });
    }

    function makeIsoObject(items, iso) {
      const toStash = items.map((item) => {
        return item.full_source;
      }).filter((item) => {
        return item !== iso;
      });

      return {
        isolated: iso,
        articlesToStash: toStash,
      };
    }

    function doIsolate(itemObj) {
      const isolated = itemObj.isolated;
      const toStash = itemObj.articlesToStash;

      const movePromises = toStash.map((article) => {
        const newName = path.join(exileDir, article.substr(article.lastIndexOf(path.sep)));
        return new Promise(((resolve) => {
          resolve(move(article, newName));
        }));
      });

      // just for outputting a completed message
      const thePost = (isolated) ? isolated : 'All posts';

      return Promise.all(movePromises).then(() => {
        return thePost;
      });
    }

    function move(origin, destination) {
      // setting up the moving of the asset dirs in case they exist
      const assetDir = path.join(path.parse(origin).dir, path.parse(origin).name);
      const assetDirDestination = path.join(path.parse(destination).dir, path.parse(destination).name);
      Promise.resolve(isDir(assetDir)).then((exists) => {
        if (exists) {
          fsRename(assetDir, assetDirDestination).then(() => {
            // console.log('%s moved to %s', assetDir, assetDirDestination);
          }).catch((err) => {
            console.log('%s could not be moved to %s: %s', assetDir, assetDirDestination, err);
          });
        }
      });
      return fsRename(origin, destination).then(() => {
        // console.log('%s moved to %s', origin, destination);
      }).catch((err) => {
        console.log('%s could not be moved to %s: %s', origin, destination, err);
      });
    }

  });
};

