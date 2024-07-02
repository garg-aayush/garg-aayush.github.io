---
layout: post
title:  Managing multiple CUDA versions using environment modules in Ubuntu
tags: ["gpu", "cuda", "nvidia", 'module']
mathjax: true
summary: Guide to install CUDA locally and manage multiple cuda environments on Ubuntu GPU server.
---

> Latest Update: May 19th, 2024

- [Github Gist Link](https://gist.github.com/garg-aayush/156ec6ddda3d62e2c0ddad00b7e66956)

This blog contains all the steps required to:
- Install multiple CUDA versions (e.g., `CUDA 11.8 and `CUDA 12.1
- Manage multiple CUDA environments on Ubuntu using the utility called [environment modules](https://modules.readthedocs.io/en/latest/).
- Use this approach to avoid CUDA environment conflicts.

> Environment Modules is a package that provides for the dynamic modification of a user's environment via modulefiles. You can find more on it at [https://modules.readthedocs.io/en/latest/](https://modules.readthedocs.io/en/latest/)

### Install the Compatible NVIDIA Drivers (if required)

- Add PPA GPU Drivers Repository to the System
    
    ```bash
    sudo add-apt-repository ppa:graphics-drivers/ppa
    ```
- Check GPU and available drives
    
    ```bash
    ubuntu-drivers devices
    # install it using: sudo ubuntu-drivers
    ```

- Install the compatible driver
    
    ```bash
    # best to allow Ubuntu to autodetect and install the compatible nvidia-driver
    sudo ubuntu-drivers install
    ```
    > For example, I tried to install `nvidia-driver-545` using `sudo ubuntu-drivers install nvidia:545` command. However, I was unable to install it. There was always some or the other issue.

    > **Note**:
    > Please **restart** your system after installing the nvidia driver. Ideally, you should be able to get GPU state and stats using `nvidia-smi` 

- Check the installed NVIDIA driver
    
    ```bash
    nvidia-detector 
    ```
 
- Additionally, you can also install NVIDIA drivers using the **Software & Updates** Ubuntu app. Just go to the **Additional Drivers** tab, choose a driver, and click **Apply Changes**.
  

### Install `CUDA 11.8` and `CUDA 12.1`

- Go to the [https://developer.nvidia.com/cuda-toolkit-archive](https://developer.nvidia.com/cuda-toolkit-archive) and select `CUDA Toolkit 11.8` from the available options. 

- Choose your OS, architecture, distribution, version, and installer type. For example, in my case:

    Option  | value
    | :---:|:---:|
    | OS  | Linux |
    | Architecture  | x86_64 |
    | Distribution  | Linux |
    | Version  | 22.04 |
    | Installer type  | deb(local) |

- Follow the provided installation instructions by copying and pasting the commands into your terminal. This will install `CUDA 11.8`. Use the following commands:
    
    ```bash
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
    sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600  
    wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda-repo-ubuntu2204-11-8-local_11.8.0-520.61.05-1_amd64.deb
    sudo dpkg -i cuda-repo-ubuntu2204-11-8-local_11.8.0-520.61.05-1_amd64.deb
    sudo cp /var/cuda-repo-ubuntu2204-11-8-local/cuda-*-keyring.gpg /usr/share/keyrings/
    sudo apt-get update
    sudo apt-get -y install cuda
    ```

- Similarly, install `CUDA 12.1` using the following commands:
    
    ```bash
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
    sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600
    wget https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda-repo-ubuntu2204-12-1-local_12.1.0-530.30.02-1_amd64.deb
    sudo dpkg -i cuda-repo-ubuntu2204-12-1-local_12.1.0-530.30.02-1_amd64.deb
    sudo cp /var/cuda-repo-ubuntu2204-12-1-local/cuda-*-keyring.gpg /usr/share/keyrings/
    sudo apt-get update
    sudo apt-get -y install cuda
    ```

- Make sure to copy and execute the commands above in your terminal to install `CUDA 11.8` and `CUDA 12.1` on your system.

### Install `cuDNN` library

- Go to [https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/linux-x86_64/](https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/linux-x86_64/) and download the `cuDNN` tar for `CUDA 11.x`. Note that you might need to create a developer's account first.

- Untar the downloaded file using the following command:
    
    ```bash
    tar -xvf cudnn-linux-x86_64-9.1.0.70_cuda11-archive.tar.xz # CUDA 11.x
    tar -xvf cudnn-linux-x86_64-9.1.0.70_cuda12-archive.tar.xz # CUDA 12.x
    
    ```

- Copy the `cuDNN` files to the `CUDA` toolkit files:
    
    ```bash
    # for CUDA 11.8
    cd cudnn-linux-x86_64-9.1.0.70_cuda11-archive/
    sudo cp include/cudnn*.h /usr/local/cuda-11.8/include
    sudo cp lib64/libcudnn* /usr/local/cuda-11.8/lib64
    
    # for CUDA 12.1
    cd cudnn-linux-x86_64-9.1.0.70_cuda12-archive/
    sudo cp include/cudnn*.h /usr/local/cuda-12.1/include
    sudo cp lib64/libcudnn* /usr/local/cuda-12.1/lib64
    ```

- Make the files executable:
    
    ```bash
    sudo chmod a+r /usr/local/cuda-11.8/include/cudnn*.h /usr/local/cuda-11.8/lib64/libcudnn*
    sudo chmod a+r /usr/local/cuda-12.1/include/cudnn*.h /usr/local/cuda-12.1/lib64/libcudnn*
    ```

- **Note**: Strictly speaking, you are done with the CUDA setup. You can use it by adding the CUDA bin and library path to the `PATH` and `LD_LIBRARY_PATH` environment variables. For example, you can set up CUDA 11.8 by adding the following lines in the `~/.bashrc`:

    ```bash
    PATH=/usr/local/cuda-11.8/bin:$PATH
    LD_LIBRARY_PATH=/usr/local/cuda-11.8/extras/CUPTI/lib64:$LD_LIBRARY_PATH
    LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH
    ```

Similarly, you can set up CUDA 12.1. However, manually changing the paths every time can be cumbersome!

**Note**: In case, you only want to install either of the one, CUDNN 11.x or CUDNN 12.x. The simpler way is to go to [https://developer.nvidia.com/cudnn-downloads](https://developer.nvidia.com/cudnn-downloads) and install the CUDNN 11.x or CUDNN 12.x similar to CUDA installation. 

### Manage multiple CUDA versions using `environment modules`

1. **Install the environment modules utility**
    
    Run the following commands:
      
      ```bash
          sudo apt-get update
          sudo apt-get install environment-modules
      ```
    
    Check the installation:
      
      ```bash
      # Check the installation by running
      module list
      ```

    > You should see a list of default installed modules like git and maybe their versions displayed when you run the command `module list`. This confirms that the environment modules utility has been successfully installed on your system.

2. **Create modulefiles for CUDA distributions**

    > **Note**: You might need root permissions to create directories and files. Use sudo in that case.

    Create a directory `/usr/share/modules/modulefiles/cuda` to hold modulefiles for cuda distributions
        
    ```bash
    sudo mkdir -p /usr/share/modules/modulefiles/cuda
    ```

    Create a modulefile `/usr/share/modules/modulefiles/cuda/11.8` for `CUDA 11.8` and add the following lines:
        
    ```bash
    #%Module1.0
    ##
    ## cuda 11.8 modulefile
    ##

    proc ModulesHelp { } {
        global version
        
        puts stderr "\tSets up environment for CUDA $version\n"
    }

    module-whatis "sets up environment for CUDA 11.8"

    if { [ is-loaded cuda/12.1 ] } {
    module unload cuda/12.1
    }

    set version 11.8
    set root /usr/local/cuda-11.8
    setenv CUDA_HOME	$root

    prepend-path PATH $root/bin
    prepend-path LD_LIBRARY_PATH $root/extras/CUPTI/lib64
    prepend-path LD_LIBRARY_PATH $root/lib64
    conflict cuda
    ```

    Similarly, create a modulefile `/usr/share/modules/modulefiles/cuda/12.1` for `CUDA 12.1` and add the following lines:
       
    ```bash
    #%Module1.0
    ##
    ## cuda 12.1 modulefile
    ##

    proc ModulesHelp { } {
        global version
        
        puts stderr "\tSets up environment for CUDA $version\n"
    }

    module-whatis "sets up environment for CUDA 12.1"

    if { [ is-loaded cuda/11.8 ] } {
    module unload cuda/11.8
    }

    set version 12.1
    set root /usr/local/cuda-12.1
    setenv CUDA_HOME	$root

    prepend-path PATH $root/bin
    prepend-path LD_LIBRARY_PATH $root/extras/CUPTI/lib64
    prepend-path LD_LIBRARY_PATH $root/lib64
    conflict cuda
    ```

3. **Make `CUDA 11.8` the default cuda version**

    Create a file `/usr/share/modules/modulefiles/cuda.version` to make `CUDA 11.8` the default cuda module:
    
    ```bash
    #%Module
    set ModulesVersion 11.8
    ```

    > **Note**: make sure to reload your terminal.

4. **Changing and Viewing the CUDA Module**
   
    To change and view the loaded CUDA module, you can use the following commands:
       
    ```bash
    # Check the currently loaded module
    module list
    # Check the available modules
    module avail
    
    # Load a specific cuda version
    module load cuda/12.1
    # Unload the currently loaded CUDA module
    module unload cuda
    # Load CUDA 11.8
    module load cuda/11.8
    
    # verify the paths of the loaded CUDA
    nvcc --version # should give the loaded CUDA version
    echo $CUDA_HOME
    echo $PATH
    echo $LD_LIBRARY_PATH
    ```

   > **Note**: You can add additional `CUDA` versions or other packages by creating corresponding modulefiles and following the steps outlined in this gist.


### Some Useful Tips
1. **What to do if `nvidia-smi` does not works**

    Sometime, after Ubuntu update or some other weird issue. The system might not be able to detect drivers. For example, you get erros such as `nvidia-smi has failed because it couldn't communicate with the NVIDIA driver. Make sure that the latest NVIDIA driver is installed and running.` The best solution is to remove the current drivers and reinstall the compatible nvidia-driver.
    
    ```bash
    # removes all the nvidia drivers
    sudo apt-get --purge remove "*nvidia*" "libxnvctrl*"
    # reinstall the compatible driver and restart
    sudo ubuntu-drivers install
    ```

2. **How to purge CUDA from your computer**
    
    **> DO IT AT YOUR OWN RISK**
    
    ```bash
    # removes all the nvidia drivers
    sudo apt-get --purge remove "*nvidia*" "libxnvctrl*"
    # remove all cuda versions
    sudo apt-get --purge remove "*cuda*" "*cublas*" "*cufft*" "*cufile*" "*curand*"  "*cusolver*" "*cusparse*" "*gds-tools*" "*npp*" "*nvjpeg*" "nsight*" "*nvvm*"
    # remove all cuda folders
    sudo rm -rf /usr/loca/cuda*
    ```

## Resources and helpful links
- [https://ubuntu.com/server/docs/nvidia-drivers-installation](https://ubuntu.com/server/docs/nvidia-drivers-installation)
- [https://developer.nvidia.com/cuda-toolkit-archive](https://developer.nvidia.com/cuda-toolkit-archive)
- [https://developer.nvidia.com/cudnn-downloads](https://developer.nvidia.com/cudnn-downloads)


---
Thanks for reading! If you have any questions or feedback, please let me know on [Twitter](https://twitter.com/Aayush_ander) or [LinkedIn](https://www.linkedin.com/in/aayush-garg-8b26a734/).
