const fs = require('fs')
const https = require('https')
const path = require('path')

const isDirVaild = (str) => {
  const except = ['<', '>', ':', '/', '\\', '|', '?', '*', '"']
  for (const i in except) {
    if (str.includes(except[i])) { return false }
  }
  return true
}

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
  return (url.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/) != null)
}

module.exports = {
  readFileSync: (filePath) => {
    try {
      const rawdata = fs.readFileSync(filePath)
      return JSON.parse(rawdata)
    } catch (error) {
      const dir = getParentDirectory(filePath)
      if (!isDirVaild(dir)) { return {} }
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
      if (!isDirVaild(dir)) { return }
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir) }
      const data = JSON.stringify(obj)
      fs.writeFileSync(filePath, data)
    }
  },
  downloadFile: (url, dest, cb) => {
    try {
      if (!checkURL(url)) { return }
      if (!isDirVaild(dest)) { return }
      dest = 'assets/images/' + dest + '/'
      if (!fs.existsSync(dest)) { fs.mkdirSync(dest) }
      const fileDest = dest + uuidv4() + url.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/)[0]
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
    } catch (error) {
      console.log(error)
    }
  },
  getRandomFile: (type, dir) => {
    dir = 'assets/' + type + '/' + dir + '/'
    var files = fs.readdirSync(dir)
    const file = files[Math.floor(Math.random() * files.length)]
    if (file === undefined) { return null }
    return path.join(dir, files[Math.floor(Math.random() * files.length)])
  },
  checkFileDirectoryIsExist: (dir) => {
    return fs.existsSync(dir)
  },
  removeFile: (path) => {
    return new Promise((resolve, reject) => {
      fs.unlink(path, (error) => {
        if (error) {
          reject(new Error('無此檔案，請確認檔案名稱與類型正確'))
        } else {
          resolve()
        }
      })
    })
  }
}
