'use strict';

const Promise = require('bluebird');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fsStat = Promise.promisify(require('fs').stat);
const fsUnlink = Promise.promisify(require('fs').unlink);
const fsRmdir = Promise.promisify(require('rimraf'));

module.exports = function modExports(args) {
  if (!args._.join('')) {
    console.log(chalk.red('You need to search for a specific post before you can remove it. Check `hexo help remove` for usage details.'));
    process.exit();
  }

  // every whitespace-separated word in the input search is a case-insensitive regular expression
  const searchTerms = args._.map((arg) => {
    return new RegExp(arg, 'i');
  });

  // load database
  this.load().then(() => {
    const locals = this.locals;

    // load posts and pages
    getArticles(locals).then((articles) => {
      return selectArticle(articles);
    }).then((selected) => {
      return confirmRemove(selected);
    }).catch((err) => {
      console.log(err.stack ? chalk.red(err.stack) : chalk.gray(err));
      process.exit();
    });

    function getArticles(data) {
      return Promise.resolve(data.get('posts').toArray().concat(locals.get('pages').toArray()));
    }

    function filterOnName(articles, terms) {
      return articles.filter((article) => {
        return terms.every((term) => {
          return term.test(article.title) || term.test(article.slug);
        });
      });
    }

    function selectArticle(items) {
      const filtered = filterOnName(items, searchTerms);

      if (filtered.length === 0) {
        return Promise.reject(chalk.red('No posts or pages found using your query.'));
      }

      if (filtered.length === 1) {
        return Promise.resolve(filtered[0]);
      }

      const entries = filtered.map((article) => {
        return [article.title, ' (', chalk.green(article.source), ')'].join('');
      });

      return inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select the post or page you wish to rename.',
          choices: entries,
        },
      ]).then((answer) => {
        const pos = entries.indexOf(answer.selected);
        return filtered[pos];
      });
    }

    function confirmRemove(post) {
      const message = '\n - Remove ' + chalk.green.underline(post.title) + '?\n' + chalk.red.bgBlack('Warning: this action is irreversible!');
      const del = chalk.red('Delete it!');
      const can = chalk.green('Cancel');

      return inquirer.prompt([
        {
          type: 'list',
          message: message,
          name: 'answer',
          choices: [
            del,
            can,
          ],
        },
      ]).then((response) => {
        const ans = response.answer;

        switch (ans) {
        case del:
          remove(post);
          break;
        case can:
          console.log(chalk.gray('OK. See you later.'));
          process.exit();
          break;
        default:
          console.log(chalk.red('This shouldn\'t happen, please file a bug report.'));
          process.exit();
        }
        return chalk.gray('Done.');
      });
    }

    function remove(post) {
      const src = post.full_source;

      // first check if the file exists
      fsStat(src).then((stats) => {
        if (stats.isFile()) {

          // delete the file
          fsUnlink(src).then(() => {
            const assetDir = src.substr(0, src.lastIndexOf('.'));
            console.log(chalk.red.underline(src + ' deleted.'));

            // check for the asset directory
            fsStat(assetDir).then((adStats) => {
              if (adStats.isDirectory()) {

                // delete the asset dir
                fsRmdir(assetDir).then(() => {
                  console.log(chalk.red.underline(assetDir + ' (asset directory) deleted.'));
                });
              }
            }).catch(() => {
              console.log(chalk.gray('No asset dir found.'));
            });
          });
        }
      }).catch((err) => {
        console.log(chalk.red('Problem deleting article :', err));
        process.exit();
      });
    }

  });
};

