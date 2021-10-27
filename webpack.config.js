const path = require('path');

module.exports = {
  entry: './src/treemap.js',
  output: {
    filename: 'treemap.js',
    path: path.resolve(__dirname),
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      // {
      //   test: /\.css$/i,
      //   use: [
      //     { loader: 'style-loader', options: { injectType: 'lazyStyleTag' } },
      //     'css-loader',
      //   ],
      // },
    ]
  },
  devServer: {
      contentBase: false,
      compress: true,
      port: 3443,
      https: true
  },
  devtool: 'eval',
  watch: true
};

