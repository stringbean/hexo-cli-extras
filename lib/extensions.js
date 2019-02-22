'use strict';

const open = require('opn');
const spawn = require('child_process').spawn;

module.exports = function modExports(hexo) {
  const editor = process.env.EDITOR;

  // extend `hexo new` to open newly created post/draft
  hexo.on('new', (post) => {
    const content = post.content;

    // only open a new empty post -- prevent opening on publishing an already written one
    if (content.substr(content.indexOf('\n---\n')).length === 5) {
      if (!editor) {
        open(post.path);
      } else {
        const edit = spawn(editor, [post.path], {stdio: 'inherit'});
        edit.on('exit', process.exit);
      }
    }
  });
};
