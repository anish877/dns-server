const dgram = require("dgram");
const { builtinModules } = require("module");

function createDNSHeader(buff) {
  const header = Buffer.alloc(12); // DNS header is 12 bytes

  // Packet Identifier (ID) - 16 bits: Set to 1234 (0x04D2 in hex)
  header.writeUInt16BE(buff.readUInt16BE(0), 0);

  // Flags - 16 bits: QR = 1, OPCODE = 0, AA = 0, TC = 0, RD = 0, RA = 0, Z = 0, RCODE = 0
  // QR (1) OPCODE (4) AA (1) TC (1) RD (1) RA (1) Z (3) RCODE (4)
  // 0x8000: QR = 1 (response), everything else = 0 
  // Extract the necessary fields from the incoming buffer
  const opcode = buff.readUInt16BE(2) & 0x7800; // Extract OPCODE bits
  const rd = buff.readUInt16BE(2) & 0x0100; // Extract RD bit
  const rcode = (opcode === 0) ? 0 : 4; // Set RCODE based on OPCODE

  // QR = 1 (response), AA = 0, TC = 0, RA = 0QD
  const flags = 0x8000 | opcode | rd | rcode; // Construct flags with RD included
  header.writeUInt16BE(flags, 2);

  // QDCOUNT (number of questions) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(buf.readUInt16BE(4), 4);

  // ANCOUNT (number of answers) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(buf.readUInt16BE(4), 6);

  // NSCOUNT (number of authority records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 8);

  // ARCOUNT (number of additional records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 10);

  return header;
}

function getDomainName(buff,offset = 12) {
  let domain = "";
  let jumped = false;
  let jumpOffset = -1

  // Loop through domain name labels
  while (true) {
    const length = buff.readUInt8(offset);
    // Check for pointer (compression)
    if ((length & 0xC0) === 0xC0) { // First two bits are 11 (indicating a pointer)
      if (!jumped) {
        jumpOffset = offset + 2; // Save where to jump back to after pointer
      }
      const pointer = buff.readUInt16BE(offset) & 0x3FFF; // Mask first 2 bits, get pointer
      offset = pointer; // Jump to pointer location
      jumped = true;
      continue; // Continue parsing at the new offset
    }
      if (offset >= buff.length) { // Check if offset is out of buffer range
        throw new Error("offset out of bounds while parsing domain name");
      }

    if (length === 0) break; // Null byte indicates the end of the domain name

    // Check if length is valid and within buffer bounds
    if (offset + length + 1 > buff.length) {
      throw new Error("Invalid domain name length in buffer");
    }

    domain += buff.toString("utf-8", offset + 1, offset + 1 + length) + ".";
    offset += length + 1;
  }
  
  if (jumped && jumpOffset !== -1) {
    offset = jumpOffset; // If jumped, restore the original offset
  }

  return { domain: domain.slice(0, -1), newOffset: offset + 1 };
}

function getEncodedName(domain) {
  const domainParts = domain.split(".");
  const encodedParts = [];

  domainParts.forEach((part) => {
    const lengthBuffer = Buffer.alloc(1); // Length of each part
    lengthBuffer.writeUInt8(part.length, 0); // Write the length as a single byte
    const nameBuffer = Buffer.from(part, "utf-8"); // Write the part itself
    encodedParts.push(lengthBuffer, nameBuffer);
  });

  // Push the final null byte
  encodedParts.push(Buffer.from([0x00]));

  return Buffer.concat(encodedParts); // Return the concatenated buffer
}

function createQuestionSection(domain) {
  // Encode the domain name codecrafters.io
  

  // const name = Buffer.from([
  //   0x0c, // Length of "codecrafters" (12 bytes)
  //   0x63, 0x6f, 0x64, 0x65, 0x63, 0x72, 0x61, 0x66, 0x74, 0x65, 0x72, 0x73, // "codecrafters"
  //   0x02, // Length of "io" (2 bytes)
  //   0x69, 0x6f, // "io"
  //   0x00, // Null byte to terminate the domain name
  // ]);

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // Concatenate all parts
  const name = getEncodedName(domain)
  return Buffer.concat([name, type, classField]);
}

function createAnswerSection(domain){

  const name = getEncodedName(domain)

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // TTL (Time to live) - 4 bytes, big-endian
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32BE(60, 0); // TTL of 60 seconds

  // RDLENGTH (length of RDATA) - 2 bytes, big-endian
  const rdlength = Buffer.alloc(2);
  rdlength.writeUInt16BE(4, 0); // 4 bytes for the IPv4 address

  // RDATA (IPv4 address) - 4 bytes, big-endian
  const rdata = Buffer.from([8, 8, 8, 8]); // Example IP address (8.8.8.8)

  // Concatenate all parts
  return Buffer.concat([name, type, classField, ttl, rdlength, rdata]);
}

const udpSocket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");

udpSocket.on("message", (buf, rinfo) => {
  try {
    const header = createDNSHeader(buf)
    let offset = 12; // DNS header ends at byte 12
    const questionCount = buf.readUInt16BE(4); // QDCOUNT

    let questions = [];
    for (let i = 0; i < questionCount; i++) {
      const question = getDomainName(buf, offset);
      questions.push(question.domain);
      offset = question.newOffset; // Update offset after reading each question
    }
    const questionSection = Buffer.concat(
      questions.map(domain => createQuestionSection(domain))
    );

    const answerSection = Buffer.concat(
      questions.map(domain => createAnswerSection(domain))
    );

    const response = Buffer.concat([header, questionSection, answerSection]);
    udpSocket.send(response, rinfo.port, rinfo.address);
  } catch (e) {
    console.log(`Error receiving data: ${e}`);
  }
});

udpSocket.on("error", (err) => {
  console.log(`Error: ${err}`);
});

udpSocket.on("listening", () => {
  const address = udpSocket.address();
  console.log(`Server listening ${address.address}:${address.port}`);
});
