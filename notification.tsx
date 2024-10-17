export class Notification {
    static permission: NotificationPermission = 'default'
  
    static async requestPermission() {
      if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification')
        return
      }
  
      this.permission = await Notification.requestPermission()
    }
  
    static show(title: string, options?: NotificationOptions) {
      if (this.permission !== 'granted') {
        console.warn('Notification permission not granted')
        return
      }
  
      new globalThis.Notification(title, options)
    }
  }