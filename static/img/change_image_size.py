import cv2

img = cv2.imread("aayush.jpg")
# crop image
print(img.shape)

# crop image
new_img = img[300:2178, 100:1978]
cv2.imwrite("aayush_cropped.jpg", new_img)