// Generated by CoffeeScript 1.12.6
var QEMU_BIN_NAME, QEMU_VERSION, cacheHighlightStream, copyQemu, generateConnectOpts, getQemuPath, hasQemu, installQemu, parseBuildArgs, platformNeedsQemu, tarDirectory;

QEMU_VERSION = 'v2.5.50-resin-execve';

QEMU_BIN_NAME = 'qemu-execve';

exports.appendOptions = function(opts) {
  return opts.concat([
    {
      signature: 'docker',
      parameter: 'docker',
      description: 'Path to a local docker socket',
      alias: 'P'
    }, {
      signature: 'dockerHost',
      parameter: 'dockerHost',
      description: 'The address of the host containing the docker daemon',
      alias: 'h'
    }, {
      signature: 'dockerPort',
      parameter: 'dockerPort',
      description: 'The port on which the host docker daemon is listening',
      alias: 'p'
    }, {
      signature: 'ca',
      parameter: 'ca',
      description: 'Docker host TLS certificate authority file'
    }, {
      signature: 'cert',
      parameter: 'cert',
      description: 'Docker host TLS certificate file'
    }, {
      signature: 'key',
      parameter: 'key',
      description: 'Docker host TLS key file'
    }, {
      signature: 'tag',
      parameter: 'tag',
      description: 'The alias to the generated image',
      alias: 't'
    }, {
      signature: 'buildArg',
      parameter: 'arg',
      description: 'Set a build-time variable (eg. "-B \'ARG=value\'"). Can be specified multiple times.',
      alias: 'B'
    }, {
      signature: 'nocache',
      description: "Don't use docker layer caching when building",
      boolean: true
    }, {
      signature: 'emulated',
      description: 'Run an emulated build using Qemu',
      boolean: true,
      alias: 'e'
    }
  ]);
};

exports.generateConnectOpts = generateConnectOpts = function(opts) {
  var connectOpts;
  connectOpts = {};
  if ((opts.docker != null) && (opts.dockerHost == null)) {
    connectOpts.socketPath = opts.docker;
  } else if ((opts.dockerHost != null) && (opts.docker == null)) {
    connectOpts.host = opts.dockerHost;
    connectOpts.port = opts.dockerPort || 2376;
  } else if ((opts.docker != null) && (opts.dockerHost != null)) {
    throw new Error("Both a local docker socket and docker host have been provided. Don't know how to continue.");
  } else {
    connectOpts.socketPath = '/var/run/docker.sock';
  }
  if ((opts.ca != null) || (opts.cert != null) || (opts.key != null)) {
    if (!((opts.ca != null) && (opts.cert != null) && (opts.key != null))) {
      throw new Error('You must provide a CA, certificate and key in order to use TLS');
    }
    connectOpts.ca = opts.ca;
    connectOpts.cert = opts.cert;
    connectOpts.key = opts.key;
  }
  return connectOpts;
};

exports.tarDirectory = tarDirectory = function(dir) {
  var Promise, fs, getFiles, klaw, pack, path, streamToPromise, tar;
  Promise = require('bluebird');
  tar = require('tar-stream');
  klaw = require('klaw');
  path = require('path');
  fs = require('mz/fs');
  streamToPromise = require('stream-to-promise');
  getFiles = function() {
    return streamToPromise(klaw(dir)).filter(function(item) {
      return !item.stats.isDirectory();
    }).map(function(item) {
      return item.path;
    });
  };
  pack = tar.pack();
  return getFiles(dir).map(function(file) {
    var relPath;
    relPath = path.relative(path.resolve(dir), file);
    return Promise.join(relPath, fs.stat(file), fs.readFile(file), function(filename, stats, data) {
      return pack.entryAsync({
        name: filename,
        size: stats.size,
        mode: stats.mode
      }, data);
    });
  }).then(function() {
    pack.finalize();
    return pack;
  });
};

cacheHighlightStream = function() {
  var EOL, colors, es, extractArrowMessage;
  colors = require('colors/safe');
  es = require('event-stream');
  EOL = require('os').EOL;
  extractArrowMessage = function(message) {
    var arrowTest, match;
    arrowTest = /^\s*-+>\s*(.+)/i;
    if ((match = arrowTest.exec(message))) {
      return match[1];
    } else {
      return void 0;
    }
  };
  return es.mapSync(function(data) {
    var msg;
    msg = extractArrowMessage(data);
    if ((msg != null) && msg.toLowerCase() === 'using cache') {
      data = colors.bgGreen.black(msg);
    }
    return data + EOL;
  });
};

parseBuildArgs = function(args, onError) {
  var _, buildArgs;
  _ = require('lodash');
  if (!_.isArray(args)) {
    args = [args];
  }
  buildArgs = {};
  args.forEach(function(str) {
    var pair;
    pair = /^([^\s]+?)=(.*)$/.exec(str);
    if (pair != null) {
      return buildArgs[pair[1]] = pair[2];
    } else {
      return onError(str);
    }
  });
  return buildArgs;
};

exports.runBuild = function(params, options, getBundleInfo, logStreams) {
  var Promise, dockerBuild, doodles, es, logging, logs, path, qemuPath, resolver, transpose;
  Promise = require('bluebird');
  dockerBuild = require('resin-docker-build');
  resolver = require('resin-bundle-resolve');
  es = require('event-stream');
  doodles = require('resin-doodles');
  transpose = require('docker-qemu-transpose');
  path = require('path');
  logging = require('../utils/logging');
  if (params.source == null) {
    params.source = '.';
  }
  logs = '';
  qemuPath = '';
  return Promise["try"](function() {
    if (!(options.emulated && platformNeedsQemu())) {
      return;
    }
    return hasQemu().then(function(present) {
      if (!present) {
        logging.logInfo(logStreams, 'Installing qemu for ARM emulation...');
        return installQemu();
      }
    }).then(function() {
      return copyQemu(params.source);
    }).then(function(binPath) {
      return qemuPath = path.relative(params.source, binPath);
    });
  }).then(function() {
    return tarDirectory(params.source);
  }).then(function(tarStream) {
    return new Promise(function(resolve, reject) {
      var builder, connectOpts, hooks, opts;
      hooks = {
        buildSuccess: function(image) {
          var doodle;
          if (options.tag != null) {
            console.log("Tagging image as " + options.tag);
          }
          doodle = doodles.getDoodle();
          console.log();
          console.log(doodle);
          console.log();
          return resolve({
            image: image,
            log: logs + '\n' + doodle + '\n'
          });
        },
        buildFailure: reject,
        buildStream: function(stream) {
          var buildThroughStream, logThroughStream, newStream;
          if (options.emulated) {
            logging.logInfo(logStreams, 'Running emulated build');
          }
          getBundleInfo(options).then(function(info) {
            var arch, bundle, deviceType;
            if (info == null) {
              logging.logWarn(logStreams, 'Warning: No architecture/device type or application information provided.\n	Dockerfile/project pre-processing will not be performed.');
              return tarStream;
            } else {
              arch = info[0], deviceType = info[1];
              bundle = new resolver.Bundle(tarStream, deviceType, arch);
              return resolver.resolveBundle(bundle, resolver.getDefaultResolvers()).then(function(resolved) {
                logging.logInfo(logStreams, "Building " + resolved.projectType + " project");
                return resolved.tarStream;
              });
            }
          }).then(function(buildStream) {
            if (options.emulated && platformNeedsQemu()) {
              return transpose.transposeTarStream(buildStream, {
                hostQemuPath: qemuPath,
                containerQemuPath: "./" + QEMU_BIN_NAME
              });
            } else {
              return buildStream;
            }
          }).then(function(buildStream) {
            return buildStream.pipe(stream);
          })["catch"](reject);
          logThroughStream = es.through(function(data) {
            logs += data.toString();
            return this.emit('data', data);
          });
          if (options.emulated && platformNeedsQemu()) {
            buildThroughStream = transpose.getBuildThroughStream({
              hostQemuPath: qemuPath,
              containerQemuPath: "./" + QEMU_BIN_NAME
            });
            newStream = stream.pipe(buildThroughStream);
          } else {
            newStream = stream;
          }
          return newStream.pipe(logThroughStream).pipe(cacheHighlightStream()).pipe(logStreams.build);
        }
      };
      connectOpts = generateConnectOpts(options);
      logging.logDebug(logStreams, 'Connecting with the following options:');
      logging.logDebug(logStreams, JSON.stringify(connectOpts, null, '  '));
      builder = new dockerBuild.Builder(connectOpts);
      opts = {};
      if (options.tag != null) {
        opts['t'] = options.tag;
      }
      if (options.nocache != null) {
        opts['nocache'] = true;
      }
      if (options.buildArg != null) {
        opts['buildargs'] = parseBuildArgs(options.buildArg, function(arg) {
          return logging.logWarn(logStreams, "Could not parse variable: '" + arg + "'");
        });
      }
      return builder.createBuildStream(opts, hooks, reject);
    });
  });
};

exports.bufferImage = function(docker, imageId, bufferFile) {
  var image, streamUtils;
  streamUtils = require('./streams');
  image = docker.getImage(imageId);
  return image.get().then(function(img) {
    return streamUtils.buffer(img, bufferFile);
  });
};

exports.getDocker = function(options) {
  var Docker, Promise, connectOpts;
  Docker = require('dockerode');
  Promise = require('bluebird');
  connectOpts = generateConnectOpts(options);
  connectOpts['Promise'] = Promise;
  return new Docker(connectOpts);
};

exports.getImageSize = function(docker, image) {
  return docker.getImage(image).inspectAsync().get('Size');
};

hasQemu = function() {
  var fs;
  fs = require('mz/fs');
  return getQemuPath().then(fs.stat)["return"](true).catchReturn(false);
};

getQemuPath = function() {
  var fs, path, resin;
  resin = require('resin-sdk-preconfigured');
  path = require('path');
  fs = require('mz/fs');
  return resin.settings.get('binDirectory').then(function(binDir) {
    return fs.access(binDir)["catch"]({
      code: 'ENOENT'
    }, function() {
      return fs.mkdir(binDir);
    }).then(function() {
      return path.join(binDir, QEMU_BIN_NAME);
    });
  });
};

platformNeedsQemu = function() {
  var os;
  os = require('os');
  return os.platform() === 'linux';
};

installQemu = function() {
  var fs, request, zlib;
  request = require('request');
  fs = require('fs');
  zlib = require('zlib');
  return getQemuPath().then(function(qemuPath) {
    return new Promise(function(resolve, reject) {
      var installStream, qemuUrl;
      installStream = fs.createWriteStream(qemuPath);
      qemuUrl = "https://github.com/resin-io/qemu/releases/download/" + QEMU_VERSION + "/" + QEMU_BIN_NAME + ".gz";
      return request(qemuUrl).pipe(zlib.createGunzip()).pipe(installStream).on('error', reject).on('finish', resolve);
    });
  });
};

copyQemu = function(context) {
  var binDir, binPath, fs, path;
  path = require('path');
  fs = require('mz/fs');
  binDir = path.join(context, '.resin');
  binPath = path.join(binDir, QEMU_BIN_NAME);
  return fs.access(binDir)["catch"]({
    code: 'ENOENT'
  }, function() {
    return fs.mkdir(binDir);
  }).then(function() {
    return getQemuPath();
  }).then(function(qemu) {
    return new Promise(function(resolve, reject) {
      var read, write;
      read = fs.createReadStream(qemu);
      write = fs.createWriteStream(binPath);
      return read.pipe(write).on('error', reject).on('finish', resolve);
    });
  }).then(function() {
    return fs.chmod(binPath, '755');
  })["return"](binPath);
};
