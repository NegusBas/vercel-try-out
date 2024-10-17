import React, { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Smile, Paperclip, Send, MoreVertical, Bot } from 'lucide-react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { Notification } from './Notification'

interface Message {
  userId: string
  message: string
  timestamp: number
  status?: 'sent' | 'delivered' | 'read'
}

export default function ChatInterface() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState('')
  const [room, setRoom] = useState('general')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [publicKey, setPublicKey] = useState<CryptoKey | null>(null)
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      auth: { userId: 'user1' } // In a real app, use actual user authentication
    })

    newSocket.on('connect', () => {
      console.log('Connected to server')
      newSocket.emit('join', room)
    })

    newSocket.on('previous messages', (prevMessages: Message[]) => {
      setMessages(prevMessages)
    })

    newSocket.on('chat message', async (msg: Message) => {
      const decryptedMsg = await decryptMessage(msg)
      setMessages(prev => [...prev, decryptedMsg])
      newSocket.emit('read receipt', { room, messageId: msg.timestamp })
      showNotification(decryptedMsg)
    })

    newSocket.on('user typing', (userId: string) => {
      setTypingUsers(prev => [...prev, userId])
    })

    newSocket.on('user stopped typing', (userId: string) => {
      setTypingUsers(prev => prev.filter(id => id !== userId))
    })

    newSocket.on('message read', ({ userId, messageId }) => {
      setMessages(prev => prev.map(msg => 
        msg.timestamp === messageId ? { ...msg, status: 'read' } : msg
      ))
    })

    setSocket(newSocket)

    // Generate RSA key pair
    generateKeyPair()

    return () => {
      newSocket.disconnect()
    }
  }, [])

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const generateKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    )
    setPublicKey(keyPair.publicKey)
    setPrivateKey(keyPair.privateKey)
  }

  const handleSend = async () => {
    if (message.trim() && socket && publicKey) {
      const encryptedMessage = await encryptMessage(message)
      socket.emit('chat message', { room, message: encryptedMessage, publicKey: await exportPublicKey(publicKey) })
      setMessage('')
      setIsTyping(false)
      socket.emit('stopped typing', room)
    }
  }

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value)
    if (!isTyping && socket) {
      setIsTyping(true)
      socket.emit('typing', room)
    }
  }

  const handleStopTyping = () => {
    if (isTyping && socket) {
      setIsTyping(false)
      socket.emit('stopped typing', room)
    }
  }

  const handleEmojiSelect = (emoji: any) => {
    setMessage(prev => prev + emoji.native)
    setShowEmojiPicker(false)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && socket && publicKey) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const fileContent = e.target?.result as string
        const encryptedFile = await encryptMessage(fileContent)
        socket.emit('chat message', { room, message: encryptedFile, type: 'file', fileName: file.name, publicKey: await exportPublicKey(publicKey) })
      }
      reader.readAsDataURL(file)
    }
  }

  const encryptMessage = async (message: string): Promise<string> => {
    if (!publicKey) throw new Error("Public key not available")
    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      data
    )
    return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)))
  }

  const decryptMessage = async (msg: Message): Promise<Message> => {
    if (!privateKey) return msg
    try {
      const encryptedData = Uint8Array.from(atob(msg.message), c => c.charCodeAt(0))
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedData
      )
      const decoder = new TextDecoder()
      const decryptedMessage = decoder.decode(decryptedBuffer)
      return { ...msg, message: decryptedMessage }
    } catch (error) {
      console.error("Failed to decrypt message:", error)
      return msg
    }
  }

  const exportPublicKey = async (key: CryptoKey): Promise<string> => {
    const exported = await window.crypto.subtle.exportKey("spki", key)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  const showNotification = (msg: Message) => {
    if (Notification.permission === 'granted') {
      new Notification('New Message', { body: `${msg.userId}: ${msg.message}` })
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto h-[600px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">Chat</CardTitle>
        <Tabs defaultValue="chat" className="w-[400px]">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>
          <TabsContent value="chat">
            <div className="flex items-center space-x-2">
              <Avatar>
                <AvatarImage src="/placeholder-avatar.jpg" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">John Doe</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="admin">
            <div className="flex items-center space-x-2">
              <Button size="sm" onClick={() => console.log('Moderate messages')}>Moderate</Button>
              <Button size="sm" variant="outline" onClick={() => console.log('Manage users')}>Manage Users</Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">User Roles</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage User Roles</DialogTitle>
                  </DialogHeader>
                  {/* Add user role management UI here */}
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
        </Tabs>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full pr-4">
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-start space-x-2 ${msg.userId === 'user1' ? 'justify-end' : ''}`} ref={index === messages.length - 1 ? lastMessageRef : null}>
                {msg.userId !== 'user1' && (
                  <Avatar>
                    <AvatarImage src={`/avatar-${msg.userId}.jpg`} />
                    <AvatarFallback>{msg.userId[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`p-2 rounded-lg ${msg.userId === 'user1' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <p className="text-sm">{msg.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                {msg.userId === 'user1' && (
                  <Badge variant="secondary">{msg.status || 'sent'}</Badge>
                )}
              </div>
            ))}
            {typingUsers.length > 0 && (
              <div className="flex items-center space-x-2">
                <Avatar>
                  <AvatarImage src="/placeholder-avatar.jpg" />
                  <AvatarFallback>TY</AvatarFallback>
                </Avatar>
                <div className="bg-muted p-2 rounded-full">
                  <p className="text-sm">{typingUsers.join(', ')} is typing...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex items-center space-x-2">
        <Dialog open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost">
              <Smile className="h-4 w-4" />
              <span className="sr-only">Choose emoji</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <Picker data={data} onEmojiSelect={handleEmojiSelect} />
          </DialogContent>
        </Dialog>
        <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Attach file</span>
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
        />
        <Input
          placeholder="Type a message..."
          value={message}
          onChange={handleTyping}
          onBlur={handleStopTyping}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setMessage(prev => prev + ' @AI ')}>
          <Bot className="h-4 w-4" />
          <span className="sr-only">AI Assistant</span>
        </Button>
      </CardFooter>
    </Card>
  )
}