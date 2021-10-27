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
    static: {
      directory: path.join(__dirname, "/"),
    },
    https: true,
    port: 3000,
    devMiddleware: {
      publicPath: "https://localhost:3000/",
    },
    hot: "only",
  },
};

