module.exports = {
  entry: './app/main.jsx',
  module: {
    loaders: [
      { test: /\.jsx?$/, loader: 'jsx-loader'},
    ]
  },
  output: {
    path: __dirname + '/dist',
    filename: 'main.js',
  },
}
