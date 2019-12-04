const fs = require('fs')
const https = require('https')
const path = require('path')

const getParentDirectory = (filePath) => {
  const dir = path.dirname(filePath)
  console.log('dir:' + dir)
  return dir
}

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; var v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

const checkURL = (url) => {
  return (url.match(/\.(jpeg|jpg|gif|png)$/) != null)
}

module.exports = {
  readFileSync: (filePath) => {
    try {
      const rawdata = fs.readFileSync(filePath)
      return JSON.parse(rawdata)
    } catch (error) {
      const dir = getParentDirectory(filePath)
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir) }
      return {}
    }
  },
  writeFileSync: (filePath, obj) => {
    try {
      const data = JSON.stringify(obj)
      fs.writeFileSync(filePath, data)
    } catch (error) {
      console.error(error)
      const dir = getParentDirectory(filePath)
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir) }
      const data = JSON.stringify(obj)
      fs.writeFileSync(filePath, data)
    }
  },
  downloadFile: (url, dest, cb) => {
    if (!checkURL(url)) { return }
    if (!fs.existsSync(dest)) { fs.mkdirSync(dest) }
    const fileDest = dest + uuidv4() + url.match(/\.(jpeg|jpg|gif|png)$/)[0]
    var file = fs.createWriteStream(fileDest)
    https.get(url, function (response) {
      response.pipe(file)
      file.on('finish', function () {
        file.close(cb)
      })
    }).on('error', function (err) {
      fs.unlink(fileDest)
      if (cb) cb(err.message)
    })
  },
  getRandomFile: (dir) => {
    var files = fs.readdirSync(dir)
    const file = files[Math.floor(Math.random() * files.length)]
    if (file === undefined) { return null }
    return path.join(dir, files[Math.floor(Math.random() * files.length)])
  },
  checkFileDirectoryIsExist: (dir) => {
    return fs.existsSync(dir)
  }
}
