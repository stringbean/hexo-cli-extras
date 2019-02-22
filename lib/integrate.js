'use strict';

const Promise = require('bluebird');
const chalk = require('chalk');
const fsStat = Promise.promisify(require('fs').stat);
const fsRename = Promise.promisify(require('fs').rename);
const fsReaddir = Promise.promisify(require('fs').readdir);
const path = require('path');

module.exports = function modExports() {

  // load DB (kind of unnecessary here, but it does give easy access to source_dir)
  this.load().then(() => {
    const postsDir = path.join(this.source_dir, '_posts');
    const exileDir = path.join(postsDir, '_exile');

    isExileDir(exileDir).then((exists) => {
      if (!exists) {
        process.exit();
      }
    }).then(() => {
      return getExiledPosts(exileDir);
    }).then((files) => {
      if (!files) {
        console.log(chalk.red('No exiled posts detected. Exiting..'));
        process.exit();
      } else {
        return files;
      }
    }).then((files) => {
      // set the exiled files up for restoration
      return files.map((file) => {
        return {
          origin: path.join(exileDir, file),
          destination: path.join(postsDir, file),
        };
      });
    }).then((files) => {
      const movePromises = files.map((file) => {
        return new Promise(((resolve) => {
          resolve(move(file.origin, file.destination));
        }));
      });

      Promise.all(movePromises).then(() => {
        console.log(chalk.gray('All exiled posts and asset directories restored.'));
      });
    }).catch((err) => {
      console.log(err.stack ? chalk.red(err.stack) : chalk.red('Error: ') + chalk.gray(err));
    });

    function move(origin, destination) {
      return fsRename(origin, destination).then(() => {
        // console.log('%s moved to %s', origin, destination);
      }).catch((err) => {
        console.log('%s could not be moved to %s: %s', origin, destination, err);
      });
    }

    function isExileDir(dir) {
      return fsStat(dir).then((stats) => {
        if (stats.isFile()) {
          console.log(chalk.gray(dir), 'seems to be a file on your filesystem! It needs to be either non-existent or a directory, so please rename your _exile post and run', chalk.yellow('hexo isolate'), 'before using this command.');
          return false;
        } else if (stats.isDirectory()) {
          return true;
        } else {
          console.log(chalk.gray(dir), 'seems to be neither a file nor a directory! This really shouldn\'t be happening, please issue a bug report.');
          return false;
        }
      }).catch(() => {
        // The directory doesn't exist
        console.log(chalk.red('No _exile dir detected. Have you run'), chalk.yellow('hexo isolate'), chalk.red('first?'));
        return false;
      });
    }

    function getExiledPosts(dir) {
      return fsReaddir(dir).then((contents) => {
        return contents;
      }).catch((err) => {
        console.log(chalk.red('Error: '), err);
      });
    }
  });
};

