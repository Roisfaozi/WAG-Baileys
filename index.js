const {
  default: makeWASocket,
  useSingleFileAuthState,
} = require('@adiwajshing/baileys')

process.setMaxListeners(0)
const fileUpload = require('express-fileupload')

const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const port = 9000
const fs = require('fs')
const qrcode = require('qrcode')
const pino = require('pino')
const socketIO = require('socket.io')

const con = require('./core/core.js')

const app = express()
const server = http.createServer(app)
const io = socketIO(server)

// config cors
// const io = require("socket.io")(server, {
//   cors: {
//     origin: "https://stiker-label.com",
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });

let x

const path = './core/'

const { body, validationResult } = require('express-validator')
app.use(
  fileUpload({
    createParentPath: true,
  })
)
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

io.on('connection', (socket) => {
  socket.on('StartConnection', async (device) => {
    if (fs.existsSync(path.concat(device) + '.json')) {
      socket.emit('message', 'Whatsapp connected')
      socket.emit('ready', device)
    } else {
      const { state, saveState } = useSingleFileAuthState(
        path.concat(device) + '.json'
      )

      const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: 'fatal' }),
        browser: ['FFA', 'EDGE', '1.0'],
      })
      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update

        if (qr) {
          qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url)
            socket.emit('message', 'QR Code received, scan please!')
          })
        }

        if (connection == 'close') {
          con.gas(null, device)
          console.log(device)
          socket.emit('message', 'Whatsapp connected')
          socket.emit('ready', device)
        }
        console.log(connection)
      })
      sock.ev.on('creds.update', saveState)
    }
  })

  socket.on('LogoutDevice', (device) => {
    if (fs.existsSync(path.concat(device) + '.json')) {
      fs.unlinkSync(path.concat(device) + '.json')
      console.log('logout device ' + device)

      socket.emit('message', 'logout device ' + device)
    }
    return
  })
})

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/core/home.html')
})

app.get('/device', (req, res) => {
  res.sendFile(__dirname + '/core//device.html')
})

app.get('/scan/:id', (req, res) => {
  res.sendFile(__dirname + '/core//index.html')
})
app.get('/buku', (req, res) => {
  res.sendFile(__dirname + '/core//buku.html')
})

const wrapAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const sendResponse = (res, statusCode, status, message) => {
  res.status(statusCode).json({ status, message })
}

const validPhoneNumber = (numbers) => {
  return numbers.every((number) => number.length >= 12)
}

app.post(
  '/send',
  wrapAsync(async (req, res) => {
    const {
      body: { message: msg, number, to, type },
      files,
    } = req
    const errors = validationResult(req).formatWith(({ msg }) => msg)
    const creeds = await fs.existsSync(`${path.concat(number)}.json`)
    if (
      errors.isEmpty() &&
      creeds &&
      Array.isArray(to) &&
      validPhoneNumber(to)
    ) {
      if (files) {
        const file_ubah_nama = `${new Date().getTime()}_${
          Object.keys(files)[0]
        }`
        const fileDikirim = files[Object.keys(files)[0]]
        const namafiledikirim = `./uploads/${file_ubah_nama}`
        const fileDikirim_Mime = fileDikirim.mimetype
        await fileDikirim.mv(`./uploads/${file_ubah_nama}`)
        await con.gas(msg, number, to, type, namafiledikirim, fileDikirim_Mime)
      } else {
        await con.gas(msg, number, to, type)
      }
      sendResponse(res, 200, true, 'success')
    } else if (!errors.isEmpty()) {
      sendResponse(res, 422, false, errors.mapped())
    } else if (!creeds) {
      sendResponse(res, 401, false, 'Please scan the QR before use the API')
    } else if (!Array.isArray(to) || !validPhoneNumber(to)) {
      sendResponse(
        res,
        401,
        false,
        "Input type 'to' is not an array or contains invalid phone numbers"
      )
    }
  })
)

app.post('/device', (req, res) => {
  const no = req.body.device
  res.redirect('/scan/' + no)
})

server.listen(port, function () {
  console.log('App running on : ' + port)
})
