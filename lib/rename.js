'use strict';

const Promise = require('bluebird');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fsReadFile = Promise.promisify(require('fs').readFile);
const fsStat = Promise.promisify(require('fs').stat);
const fsWriteFile = Promise.promisify(require('fs').writeFile);
const fsRename = Promise.promisify(require('fs').rename);
const slugize = require('hexo-util').slugize;
const path = require('path');

module.exports = function modExports(args) {
  const newName = args.n || args.new || '';

  if (!args._.join('') || !newName) {
    console.log(chalk.red('Both a new and an old filename/title are required. `hexo rename help` to display help.'));
    process.exit();
  }

  // every whitespace-separated word in the input search is a case-insensitive regular expression
  const oldName = args._.map((arg) => {
    return new RegExp(arg, 'i');
  });


  // load database
  this.load().then(() => {
    let selectedPost;

    loadArticles(this.locals).then((arts) => {
      return selectArticle(arts);
    }).then((selected) => {
      selectedPost = selected;
      return chooseRenameStyle(selectedPost);
    }).then((renameStyle) => {
      if (renameStyle === 'filename') {
        return renameFile(selectedPost, newName);
      } else if (renameStyle === 'title') {
        return renameTitle(selectedPost, newName);
      } else {
        return renameTitle(selectedPost, newName).then(() => {
          return renameFile(selectedPost, newName);
        });
      }
    }).catch((err) => {
      console.log(err.stack ? chalk.red(err.stack) : chalk.red('Error: ') + chalk.gray(err));
      process.exit();
    });

    function selectArticle(items) {
      const articles = filterOnName(items, oldName);

      if (articles.length === 0) {
        return Promise.reject('No posts or pages found using your query.');
      }

      if (articles.length === 1) {
        // no menu if there is only one result
        return Promise.resolve(articles[0]);
      }

      const entries = articles.map((article) => {
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
        return articles[pos];
      });
    }

    function chooseRenameStyle(post) {
      const message = '\n - Rename title (' + chalk.green.underline(post.title) + ') to ' +
          chalk.cyan.underline(newName) + ' ?\n - Rename filename (' +
          chalk.green.underline(post.source.substr(post.source.lastIndexOf(path.sep))) + ') to ' +
          chalk.cyan.underline(slugize(newName, {transform: 1}) + '.md') + ' ?';

      return inquirer.prompt([
        {
          type: 'list',
          message: message,
          name: 'answer',
          choices: [
            'Yes, rename both',
            'Title only please (don\'t rename the file!)',
            'Filename only please (don\'t rename the title!)',
            'No, forget it, cancel everything.',
          ],
        },
      ]).then((response) => {
        const ans = response.answer;

        switch (ans) {
          case 'Yes, rename both':
            return 'both';
          case 'Title only please (don\'t rename the file!)':
            return 'title';
          case 'Filename only please (don\'t rename the title!)':
            return 'filename';
          default:
            return Promise.reject('User cancelled rename operation');
        }
      });
    }

    function renameFile(art, renamed) {

      const src = art.full_source;
      const newSrc = path.join(src.substr(0, src.lastIndexOf(path.sep)), slugize(renamed, {transform: 1}));

      // first the markdown file
      return fsRename(src, newSrc + '.md').then(() => {
        console.log(chalk.red(src) + ' renamed to ' + chalk.green(newSrc) + '.md');

        const fldr = src.substr(0, src.lastIndexOf('.'));

        // then the folder if it exists
        return fsStat(fldr).then((stats) => {
          if (stats.isDirectory()) {
            return fsRename(fldr, newSrc).then(() => {
              console.log(chalk.underline('Asset folder renamed as well.'));
            });
          } else {
            return 'Done';
          }
        }).catch(() => {
          return console.log(chalk.underline('No asset folder found.'));
        });
      });

    }

    function renameTitle(art, newTitle) {
      const oldTitle = art.title;
      const oldTitleString = new RegExp('title:.*');

      // change the title through the file system because changing it in the db caused issues
      return fsReadFile(art.full_source, 'utf8').then((data) => {
        const cont = data.replace(oldTitleString, 'title: "' + newTitle + '"');

        return fsWriteFile(art.full_source, cont, 'utf8').then(() => {
          console.log(chalk.red(oldTitle) + ' renamed to ' + chalk.green(newTitle));
        });
      });
    }

    function loadArticles(locals) {
      return Promise.resolve(locals.get('posts').toArray().concat(locals.get('pages').toArray()));
    }

    function filterOnName(articles, terms) {
      return articles.filter((article) => {
        return terms.every((term) => {
          return term.test(article.title) || term.test(article.slug);
        });
      });
    }

  });
};

