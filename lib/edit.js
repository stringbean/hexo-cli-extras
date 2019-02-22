'use strict';

const chalk = require('chalk');
const moment = require('moment');
const open = require('opn');
const editor = process.env.EDITOR;
const spawn = require('child_process').spawn;
const path = require('path');
const inquirer = require('inquirer');
const Promise = require('bluebird');

module.exports = function modExports(args) {
  const filters = {
    title: args._ || '',

    after: args.a  || args.after    ||                    null,
    before: args.b || args.before   ||                    null,
    cat: args.c    || args.category || args.categories || null,
    draft: args.draft               || args.drafts     || null,
    folder: args.f || args.folder   ||                    null,
    layout: args.l || args.layout   ||                    null,
    tag: args.t    || args.tag      ||                    null,
  };

  const gui  = args.g || args.gui  || !editor;
  const page = args.p || args.page || args.pages || null;

  // load in the posts before processing them
  this.load().then(() => {
    const sourceDir = this.source_dir;
    const searchDir = sourceDir;
    const query = (page) ? 'pages' : 'posts';

    // the following promise chain details the main functionality
    loadArticles(query, this.locals).then((articles) => {
      return filterArticles(articles, filters);
    }).then((filtered) => {
      return selectArticle(filtered);
    }).then((selected) => {
      openFile(selected);
    }).catch((err) => {
      console.log(err.stack ? chalk.red(err.stack) : chalk.red('Error: ') + chalk.gray(err));
    });

    function loadArticles(dataType, locals) {
      return Promise.resolve(locals.get(dataType).sort('-date').toArray());
    }

    function filterArticles(items, filterObj) {
      let results;
      // allow omission of leading underscore or trailing s for the common _drafts and _posts folders;
      if (/post|draft/.test(filterObj.folder)) {
        filterObj.folder = (/^_/.test(filterObj.folder)) ? filterObj.folder : '_' + filterObj.folder;
        filterObj.folder = (/s$/.test(filterObj.folder)) ? filterObj.folder : filterObj.folder + 's';
      }

      results = filterTitle(items, filterObj.title);

      results = (filterObj.draft)  ? filterDrafts(results) : results;
      results = (filterObj.layout) ? filterLayout(results, filterObj.layout) : results;
      results = (filterObj.folder) ? filterFolder(results, filterObj.folder) : results;
      results = (filterObj.tag)    ? filterTag(results, filterObj.tag) : results;
      results = (filterObj.cat)    ? filterCategory(results, filterObj.cat) : results;
      results = (filterObj.before) ? filterBefore(results, filterObj.before) : results;
      results = (filterObj.after)  ? filterAfter(results, filterObj.after) : results;

      return results;

      // filter the posts with the supplied regular expression
      function filterTitle(posts, title) {
        const reTitle = title.map((word) => {
          return new RegExp(word, 'i');
        });

        return posts.filter((post) => {
          return reTitle.every((regex) => {
            return regex.test(post.title) || regex.test(post.slug);
          });
        });
      }

      // filter the posts using a subfolder if supplied
      function filterFolder(posts, folder) {
        const reFolder = new RegExp(folder);
        return posts.filter((post) => {
          return reFolder.test(post.source.substr(0, post.source.lastIndexOf(path.sep)));
        });
      }

      // filter the posts using a tag if supplied
      function filterTag(posts, tag) {
        const reTag = new RegExp(tag);
        return posts.filter((post) => {
          return post.tags.data.some((postTag) => {
            return reTag.test(postTag.name);
          });
        });
      }

      // filter the posts using a category if supplied
      function filterCategory(posts, cat) {
        const reCat = new RegExp(cat);
        return posts.filter((post) => {
          return post.categories.data.some((postCat) => {
            return reCat.test(postCat.name);
          });
        });
      }

      // filter the posts using a layout if supplied
      function filterLayout(posts, layout) {
        const reLayout = new RegExp(layout, 'i');

        return posts.filter((post) => {
          return reLayout.test(post.layout);
        });
      }

      // filter out all non-published posts
      function filterDrafts(posts) {
        return posts.filter((post) => {
          return !post.published;
        });
      }

      // filter the posts using a before date if supplied
      function filterBefore(posts, before) {
        const momentBefore = moment(before.replace(/\//g, '-'), 'MM-DD-YYYY', true);
        if (!momentBefore.isValid()) {
          console.log(chalk.red('Before date is not valid (expecting `MM-DD-YYYY`), ignoring argument.'));
          return posts;
        }

        return posts.filter((post) => {
          return moment(post.date).isBefore(momentBefore);
        });
      }

      // filter the posts using an after date if supplied
      function filterAfter(posts, after) {
        const momentAfter = moment(after.replace(/\//g, '-'), 'MM-DD-YYYY', true);
        if (!momentAfter.isValid()) {
          console.log(chalk.red('After date is not valid (expecting `MM-DD-YYYY`), ignoring argument.'));
          return posts;
        }

        return posts.filter((post) => {
          return moment(post.date).isAfter(momentAfter);
        });
      }
    }

    function selectArticle(items) {
      if (items.length === 0) {
        return Promise.reject('Sorry, no articles match your query.');
      }

      if (items.length === 1) {
        // no menu necessary if there is only one matching file
        const selected = path.join(searchDir, items[0].source);
        return Promise.resolve(selected);
      }

      // populate a list of entries to use for the menu -- slugs are easy because they show the subfolder and can easily
      // be put back together with the searchDir to open the file
      const entries = items.map((post) => {
        const loc = post.source.substr(0, post.source.lastIndexOf(path.sep));

        if (!post.published) {
          return ['[', chalk.yellow.bgBlack('draft'), '] ', post.title].join('');
        } else {
          return ['[', chalk.gray(post.date.format('MM-DD-YYYY')), '] ', post.title, ' (', chalk.green(loc), ')'].join('');
        }
      });

      // display the menu
      return inquirer.prompt([
        {
          type: 'list',
          name: 'file',
          message: 'Select the file you wish to edit.',
          choices: entries,
        }
      ]).then((answer) => {
        const pos = entries.indexOf(answer.file);
        const selected = path.join(sourceDir, items[pos].source);

        if (!selected) {
          return Promise.reject('Invalid choice.');
        }
        return selected;
      });
    }

    // spawn process and open with associated gui or terminal editor
    function openFile(file) {
      let edit;
      if (!editor || gui) {
        open(file);
      } else {
        edit = spawn(editor, [file], {stdio: 'inherit'});
        edit.on('exit', process.exit);
      }
    }
  });
};
