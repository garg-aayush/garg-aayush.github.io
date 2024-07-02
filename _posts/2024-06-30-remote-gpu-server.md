---
layout: post
title:  Step-by-Step Guide to Setup Your Personal GPU Server
tags: ["gpu","ngrok", "openssh"]
mathjax: true
summary: A concise guide to set up a remotely accessible personal GPU Ubuntu server, enabling its access from anywhere.
---

- [Github Gist Link](https://gist.github.com/garg-aayush/d377557b20ef9f206c1d6381e174d8a7)

I've been using a GPU workstation with an RTX 4090 for almost a year now, and it's been one of the best decisions I've made. With a personal GPU server, you no longer need to rely on cloud-based GPU instances from services like `RunPod` or `Vast.ai` every time you want to run a job or try new models. The best part? No stress about recurring GPU instance costs! :-)

However, I rarely work directly on my workstation. Instead, I prefer the flexibility of accessing the GPU remotely using my MacBook, whether I'm working from different locations within my home, from a co-working space, or a cozy cafe in another part of town. 

**In this blog, I will walk you through the steps to configure a personal GPU Ubuntu server.**

For this guide, I assume you already have a workstation running Ubuntu with a GPU and it is connected to your local network

## Setting Up Local Remote Access

Let's start by setting up local access, which will allow you to `ssh` into your GPU server when you're on the same home Wi-Fi network. This is ideal for a work-from-home (WFH) setup where your workstation is running in a corner of your living space.

1. **Install the SSH server**
    
    First, we need to install an SSH (Secure Shell) server. This will allow you to securely access your GPU machine remotely. Open a terminal on your Ubuntu machine and run the following commands:
    ```bash
    sudo apt update &&
    sudo apt install openssh-server
    ```
    This command updates your package lists and installs the OpenSSH server.

2. **Start and Enable SSH Service**

    Next, enable the SSH service using this command:
    ```bash
    sudo systemctl enable --now ssh
    ```
    You can verify if the service is enabled by running:
    ```bash
    sudo systemctl status ssh
    ```

    Look for a line starting with `Active: active (running)` for `ssh.service`. This indicates that the SSH service is up and running.

    > Note: The OpenSSH server starts running on boot by default.

3. **Configure the firewall**

    To allow SSH connections through the system firewall, you need to open the appropriate port. Ubuntu's default firewall, UFW (Uncomplicated Firewall), makes this process straightforward:
    ```bash
    sudo ufw allow ssh
    ```
    This command adds an exception to your firewall rules, permitting incoming SSH connections. You can check the SSH status with:
    ```bash
    sudo ufw status
    ```
    You should see the output similar to:
    ```bash
    To                         Action      From
    --                         ------      ----
    22/tcp                     ALLOW       Anywhere
    22/tcp(v6)                 ALLOW       Anywhere (v6)
    ```

4. **Connect to the local server**
    
    Now that your GPU server is set up, it's time to test the connection. From your laptop (which should be on the same local network as your GPU machine), open a terminal and use the following command:
    ```bash
    ssh user@local-ip-address
    ```
    Replace user with your Ubuntu `user` and `local-ip-address` with the IP address of your GPU machine on the local network.
    - To find your username on the workstation, you can use the `whoami` command.
    - To find your local IP address, use one of these methods on your workstation:
        - Run `hostname -I` and use the first address listed.
        - Use `ip addr show | grep -w` inet for more detailed network information.
        - [How to find my IP address on Ubuntu Linux](https://linuxconfig.org/how-to-find-my-ip-address-on-ubuntu-20-04-focal-fossa-linux) is a great blog on it. It explains multiple commands like `ip addr show | grep -w inet` or `networkctl status`  to get the local IP address.

    > Your local IP address typically starts with 192.168.
    > 
    > Note: If your router dynamically changes the local IP address of your workstation, it's best to log into your router and assign a fixed local IP address to ensure consistent access.

    If everything is configured correctly, you'll be prompted to enter your password, after which you'll gain remote access to your GPU server.

5. **Set Up SSH Keys for Passwordless Login**
    
    It is recommended to set up key-based authentication for better security and convenience purposes. This allows you to connect to your remote server without entering a password each time.

    - It is quite common to setup ssh key-based authentication. 
    - For detailed instructions on setting up SSH keys, refer to the DigitalOcean guide on [Setting up SSH keys on Ubuntu 20.04](https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys-on-ubuntu-20-04#step-4-disabling-password-authentication-on-your-server).


## Setting Up External Remote Access
While local access is great for working within your home network, sometimes you need to access your GPU workstation from outside your local network, such as from co-working spaces or a cozy cafe.

One simple and secure way to achieve this is by using [ngrok](https://ngrok.com/). 

> ngrok helps creates secure tunnels from public endpoints to locally running services. It allows you to expose your personal server to the internet, enabling remote access from anywhere without complex network configurations.

Here's how to set it up:

1. **Install ngrok**
   
   First, you need to install ngrok on your GPU workstation. Open a terminal and run this command:
    ```bash
    snap install ngrok
    ```
    - For more installation options, see https://dashboard.ngrok.com/get-started/setup/linux.

2. **Create and connect to ngrok Account**
    
    Visit [ngrok's website](https://ngrok.com/) and sign up for a free account if you haven't already.
    After signing up, you'll receive an auth token. On your GPU workstation, run:
    ```bash
    ngrok config add-authtoken YOUR_AUTH_TOKEN
    ```
    You can get the config file path and edit using `ngrok config check` and `vim <path>`, respectively.

3. **Start the ngrok Tunnel**  
    
    Now, you can create a secure tunnel to your SSH service:
    ```bash
    ngrok tcp 22
    ```
    This command will display a URL that looks like `tcp://X.tcp.ngrok.io:PORT`. Note down this URL.

4. **Connect to Your Workstation**  
    
    From any external laptop, you can now SSH into your GPU workstation using:
    ```bash
    ssh -p YYYY user@X.tcp.ngrok.io
    ```
    Replace `PORT` with the port number and `X` with the subdomain from the ngrok URL. Replace `user` with your Ubuntu username.

    _The above steps ensure that you can remotely access the workstation from external network. However, no one is going to manually start the ngrok every time before heading out._

5. **Make ngrok start automatically on boot**
    
    To ensure ngrok starts automatically when your workstation boots:

   - Create a new service file:
  
    ```bash
    sudo vim /etc/systemd/system/ngrok.service
    ```

   - Add the following content:
    
    ```bash
    [Unit]
    Description=start ngrok tunnel on startup
    After=network.target

    [Service]
    ExecStart=/snap/bin/ngrok tcp 22
    Restart=on-failure
    User=<your_username>

    [Install]
    WantedBy=multi-user.target
    ```
    Replace `<your_username>` with your Ubuntu username. Save the file and exit the editor.

   - Enable and start the service:
    
    ```bash
    sudo systemctl enable ngrok.service
    sudo systemctl start ngrok.service
    ```
    Now ngrok will automatically start and create a tunnel when your workstation boots.

    > Note: With a free account, ngrok assigns a new port (YYYY) each time your workstation boots. You can get the new port from the [ngrok dashboard](https://dashboard.ngrok.com/tunnels/agents).


6. **Paid ngrok account for dedicated port**
    
    For a dedicated TCP endpoint port that doesn't change on reboot, you need a paid ngrok personal account (`$10/month`).

    a. Reserve a tcp endpoint
    
    Once you have a paid account, reserve a TCP endpoint at `https://dashboard.ngrok.com/cloud-edge/tcp-addresses`.

    b. Update the ngrok service file
    
    Add the following content:
    
    ```bash
    [Unit]
    Description=start ngrok tunnel on startup
    After=network.target

    [Service]
    ExecStart=/snap/bin/ngrok tcp --region=<region> --remote-addr=<remote-address> 22
    Restart=on-failure
    User=<your_username>

    [Install]
    WantedBy=multi-user.target
    ```

    Replace `<region>`, `<remote-address>`, and `<your_username>` with the appropriate values from your reserved TCP endpoint config.

**With this setup, your SSH remote endpoint will remain the same even if the system reboots.**

### Reference Links:
1. [Ubuntu SSH Documentation](https://ubuntu.com/server/docs/service-openssh)
2. [DigitalOcean Guide on Setting Up SSH Keys](https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys-on-ubuntu-20-04)
3. [ngrok Documentation](https://ngrok.com/docs)
4. [IP Address Information for Ubuntu](https://linuxconfig.org/how-to-find-my-ip-address-on-ubuntu-20-04-focal-fossa-linux)
5. [UFW (Uncomplicated Firewall) Guide](https://help.ubuntu.com/community/UFW)


---
Thanks for reading! If you have any questions or feedback, please let me know on [Twitter](https://twitter.com/Aayush_ander) or [LinkedIn](https://www.linkedin.com/in/aayush-garg-8b26a734/).
