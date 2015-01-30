os = require('os')
fs = require('fs')
_ = require('lodash')
async = require('async')

IS_WINDOWS = os.platform() is 'win32'

win32 = require('./win32')
agnostic = require('./agnostic')

exports.writeImage = (devicePath, imagePath, options = {}, callback = _.noop) ->

	async.waterfall [

		(callback) ->
			fs.exists imagePath, (exists) ->
				return callback() if exists
				return callback(new Error("Invalid OS image: #{imagePath}"))

		(callback) ->
			return callback() if IS_WINDOWS
			fs.exists devicePath, (exists) ->
				return callback() if exists
				return callback(new Error("Invalid device: #{devicePath}"))

		(callback) ->
			return callback() if not IS_WINDOWS
			win32.eraseMBR(devicePath, callback)

		(callback) ->
			return callback() if not IS_WINDOWS
			win32.rescanDrives(callback)

		(callback) ->
			if not options.progress
				options.onProgress = _.noop

			agnostic.writeImage(imagePath, devicePath, options.onProgress, callback)

		(callback) ->
			return callback() if not IS_WINDOWS
			win32.rescanDrives(callback)

	], (error) ->
		return callback() if not error?

		if error.code is 'EBUSY'
			error.message = "Try umounting #{error.path} first."

		if error.code is 'ENOENT'
			error.message = "Invalid device #{error.path}"

			# Prevents outer handler to take
			# it as an usual ENOENT error
			delete error.code

		return callback(error)
