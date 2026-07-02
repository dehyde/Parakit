/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';

export const APP_PREVIEW_STARTUP_ANIMATION_SRC = 'data:image/svg+xml;base64,' +
	'PHN2ZyB3aWR0aD0iOTkiIGhlaWdodD0iMTY3IiB2aWV3Qm94PSIwIDAgOTkgMTY3IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAw' +
	'MC9zdmciPgo8c3R5bGU+CnN2ZyB7IG92ZXJmbG93OiB2aXNpYmxlOyB9CkBrZXlmcmFtZXMga2ZfRWxsaXBzZV8xX3RyYW5zZm9ybV8wIHsKICAwJSB7CiAg' +
	'ICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBzY2FsZVgo' +
	'MCkgc2NhbGVZKDApIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICAxMi44NCUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjog' +
	'Y3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkgdHJh' +
	'bnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgwKSBzY2FsZVkoMCkgdHJhbnNsYXRlKC00LjExOHB4LCAtNC4xMThweCk7CiAgfQogIDE2LjQ1JSB7' +
	'CiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBzY2Fs' +
	'ZVgoMSkgc2NhbGVZKDEpIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICA3Ni41MiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlv' +
	'bjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkg' +
	'dHJhbnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgxKSBzY2FsZVkoMSkgdHJhbnNsYXRlKC00LjExOHB4LCAtNC4xMThweCk7CiAgfQogIDgxLjA5' +
	'JSB7CiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBz' +
	'Y2FsZVgoMCkgc2NhbGVZKDApIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICAxMDAlIHsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1' +
	'Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkgdHJhbnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgwKSBzY2FsZVkoMCkgdHJhbnNsYXRlKC00' +
	'LjExOHB4LCAtNC4xMThweCk7CiAgfQp9CiNFbGxpcHNlXzEgewogIHRyYW5zZm9ybS1vcmlnaW46IDAgMDsKICBhbmltYXRpb246IGtmX0VsbGlwc2VfMV90' +
	'cmFuc2Zvcm1fMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGU7Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMV9zdWIwX2JvcmRlci13aWR0aF8wIHsKICAwJSB7' +
	'CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDdweDsKICB9CiAgODUuMyUgewogICAgYW5pbWF0aW9u' +
	'LXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA5MS40MyUgewogICAg' +
	'YW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDkxLjQ5JSB7CiAgICBhbmltYXRpb24tdGlt' +
	'aW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDBweDsKICB9CiAgOTkuNTklIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246' +
	'IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDogMHB4OwogIH0KICAxMDAlIHsKICAgIHN0cm9rZS13aWR0aDogMHB4OwogIH0KfQpAa2V5ZnJhbWVzIGtmX1Zl' +
	'Y3Rvcl8xX3N1YjBfcGF0aC10cmltXzAgewogIDAlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAg' +
	'dmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAyLjYzNyUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLWRhc2hh' +
	'cnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDM1LjYwNSUgewogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA0NS40OTYlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgNjEuMTU1JSB7CiAgICBh' +
	'bmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC43NiwgMCwgMC4yNCwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBz' +
	'dHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDg3LjQ3MiUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwog' +
	'ICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAxMDAlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsK' +
	'ICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAtMTsKICAgIHZpc2liaWxpdHk6IGhpZGRlbjsKICB9Cn0KI1ZlY3Rvcl8xX3N1YjAgewogIGFuaW1hdGlvbjoKICAg' +
	'IGtmX1ZlY3Rvcl8xX3N1YjBfYm9yZGVyLXdpZHRoXzAgMy4wMzMyNnMgbGluZWFyIGluZmluaXRlLAogICAga2ZfVmVjdG9yXzFfc3ViMF9wYXRoLXRyaW1f' +
	'MCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGU7Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMV9zdWIxX2JvcmRlci13aWR0aF8wIHsKICAwJSB7CiAgICBhbmlt' +
	'YXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDdweDsKICB9CiAgODUuMyUgewogICAgYW5pbWF0aW9uLXRpbWluZy1m' +
	'dW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA5MS40MyUgewogICAgYW5pbWF0aW9u' +
	'LXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9' +
	'CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzFfc3ViMV9wYXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRh' +
	'c2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDQuNDE4JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2Ut' +
	'ZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IGhpZGRlbjsKICB9CiAgNC42MTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVh' +
	'cjsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAzNy41' +
	'ODMlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAg' +
	'NDcuNDc0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAg' +
	'fQogIDU2LjYwNiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS1kYXNo' +
	'YXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgNjEuMTU1JSB7CiAgICBhbmltYXRp' +
	'b24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC43NiwgMCwgMC4yNCwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwLjk3MDkgMTsKICAgIHN0' +
	'cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgODkuNDUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246' +
	'IGN1YmljLWJlemllcigwLjUsIDAsIDAuNSwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZp' +
	'c2liaWxpdHk6IGhpZGRlbjsKICB9CiAgMTAwJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2' +
	'aXNpYmlsaXR5OiBoaWRkZW47CiAgfQp9CiNWZWN0b3JfMV9zdWIxIHsKICBhbmltYXRpb246CiAgICBrZl9WZWN0b3JfMV9zdWIxX2JvcmRlci13aWR0aF8w' +
	'IDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZSwKICAgIGtmX1ZlY3Rvcl8xX3N1YjFfcGF0aC10cmltXzAgMy4wMzMyNnMgbGluZWFyIGluZmluaXRlOwp9CkBr' +
	'ZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViMl9ib3JkZXItd2lkdGhfMCB7CiAgMCUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwog' +
	'ICAgc3Ryb2tlLXdpZHRoOiA3cHg7CiAgfQogIDk1LjQ1JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC41LCAwLCAw' +
	'LjUsIDEpOwogICAgc3Ryb2tlLXdpZHRoOiA3cHg7CiAgfQogIDk5LjU5JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBz' +
	'dHJva2Utd2lkdGg6IDBweDsKICB9CiAgMTAwJSB7CiAgICBzdHJva2Utd2lkdGg6IDBweDsKICB9Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMl9zdWIyX3Bh' +
	'dGgtdHJpbV8wIHsKICAwJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBo' +
	'aWRkZW47CiAgfQogIDYuNTk0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5' +
	'OiBoaWRkZW47CiAgfQogIDI2LjMyNiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNTIsIDAsIDAuNzMxLCAwLjU1' +
	'Myk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDM5' +
	'LjU2MSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuMjQ1LCAwLjU0MywgMC41MjcsIDEpOwogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMC42NDEyIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTAuMzU4ODsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDQ5LjQ1MiUg' +
	'ewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2MS4x' +
	'NTUlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAg' +
	'ODEuMDg5JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC4wMjYsIDAuMjg5LCAwLjUsIDEpOwogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA5NS4zODMlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAxMDAlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzJfc3ViMiB7' +
	'CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViMl9ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3Jf' +
	'Ml9zdWIyX3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpAa2V5ZnJhbWVzIGtmX1ZlY3Rvcl8yX3N1YjNfYm9yZGVyLXdpZHRoXzAg' +
	'ewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA4NC4zOSUgewogICAg' +
	'YW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA4OS40' +
	'NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tl' +
	'LXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViM19wYXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTog' +
	'MCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDguNTcyJSB7CiAgICBhbmltYXRpb24tdGltaW5n' +
	'LWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IGhp' +
	'ZGRlbjsKICB9CiAgNDEuNTM5JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6' +
	'IHZpc2libGU7CiAgfQogIDUxLjQzJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxp' +
	'dHk6IHZpc2libGU7CiAgfQogIDYxLjE1NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuMTUxLCAtMC4wMTMsIDEs' +
	'IDAuNDY2KTsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9' +
	'CiAgODEuMDg5JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47' +
	'CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVu' +
	'OwogIH0KfQojVmVjdG9yXzJfc3ViMyB7CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViM19ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIg' +
	'aW5maW5pdGUsCiAgICBrZl9WZWN0b3JfMl9zdWIzX3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpAa2V5ZnJhbWVzIGtmX1ZlY3Rv' +
	'cl8yX3N1YjRfYm9yZGVyLXdpZHRoXzAgewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDog' +
	'N3B4OwogIH0KICA4Ny41NiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9r' +
	'ZS13aWR0aDogN3B4OwogIH0KICA4OS40NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7' +
	'CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViNF9wYXRoLXRyaW1fMCB7CiAgMCUg' +
	'ewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwLjcx' +
	'NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZz' +
	'ZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDUxLjQzJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9m' +
	'ZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDUzLjQwOCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRh' +
	'c2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2MS4xNTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1Ymlj' +
	'LWJlemllcigwLjc2LCAwLCAwLjI0LCAxKTsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJp' +
	'bGl0eTogdmlzaWJsZTsKICB9CiAgOTUuNTc0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2' +
	'aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAg' +
	'dmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzJfc3ViNCB7CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViNF9ib3JkZXItd2lkdGhf' +
	'MCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3JfMl9zdWI0X3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpA' +
	'a2V5ZnJhbWVzIGtmX1ZlY3Rvcl8zX3N1YjVfYm9yZGVyLXdpZHRoXzAgewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsK' +
	'ICAgIHN0cm9rZS13aWR0aDogNnB4OwogIH0KICA4NC4zOSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwg' +
	'MC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogNnB4OwogIH0KICA4Ny45MiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAg' +
	'c3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzNfc3ViNV9w' +
	'YXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTog' +
	'aGlkZGVuOwogIH0KICAxOS4xNTQlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1YmljLWJlemllcigwLjAxNywgMC45OTYsIDAuNSwgMSk7' +
	'CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDI5Ljk2' +
	'OCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2' +
	'MS4xNTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1YmljLWJlemllcigwLjc2LCAwLCAwLjI0LCAxKTsKICAgIHN0cm9rZS1kYXNoYXJy' +
	'YXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgOTcuMzYzJSB7CiAgICBzdHJva2UtZGFz' +
	'aGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzNfc3ViNSB7CiAg' +
	'YW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzNfc3ViNV9ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3JfM19z' +
	'dWI1X3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQo8L3N0eWxlPgo8ZyBpZD0icGFyYWtpdF9hbmltYXRpb25fd2hpdGUiIHRyYW5z' +
	'Zm9ybT0idHJhbnNsYXRlKDQgNCkiPgo8Y2lyY2xlIGlkPSJFbGxpcHNlXzEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU3LjY0NzEgMTYuNDcwNikiIGN4PSI0' +
	'LjExNzY1IiBjeT0iNC4xMTc2NSIgcj0iMy43MDU4OCIgZmlsbD0id2hpdGUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC44MjM1MjkiLz4KPHBh' +
	'dGggaWQ9IlZlY3Rvcl8xX3N1YjAiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE0LjgyMzUgMzguMjY5MykiIGQ9Ik0wIDUxLjQ5NTRDMCA0NC4wODM2IDMuMjk0' +
	'MTIgLTEuMjEwNSAyNy4xNzY1IDAuMDI0Nzk3NiIgcGF0aExlbmd0aD0iMSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNh' +
	'cD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAuOTI0MiAxIi8+CjxwYXRoIGlkPSJWZWN0b3JfMV9zdWIxIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNy42' +
	'MjkzOWUtMDYgNDEuNTg4MikiIGQ9Ik0wIDcwLjQxMThDMCA1OC4wNTg4IDQ2LjcxNDIgNTEuNzU4MiA1NS4xNzY1IDIwLjE3NjVDNTcuNDkzNCAxMS41Mjk0' +
	'IDU2LjQxMTggNi41ODgyNCA1MS4wNTg4IDAiIHBhdGhMZW5ndGg9IjEiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNyIgc3Ryb2tlLWxpbmVjYXA9' +
	'InJvdW5kIiBzdHJva2UtZGFzaGFycmF5PSIwLjUxMDQgMSIvPgo8cGF0aCBpZD0iVmVjdG9yXzJfc3ViMiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNi4xNzY0' +
	'NyA5OC4yMTA2KSIgZD0iTTYuMTc2NDcgMTYuMjZDNi4xNzY0NyAyNi44ODQ3IDIuMTYwNjMgMzguMDQ0OCAwLjYwNTIxNCA0OS4wOTI4QzAuMDI5MDQxNyA1' +
	'My4xODUzIDMuODI4MTMgNTUuODkzMyA2LjU4NjE2IDUyLjgxNTRDMTYuOTUzMyA0MS4yNDU4IDIzLjQ0MTggOS45NjM4NyA0MC45NzUzIDAiIHBhdGhMZW5n' +
	'dGg9IjEiIHZpc2liaWxpdHk9ImhpZGRlbiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1k' +
	'YXNoYXJyYXk9IjAgMSIvPgo8cGF0aCBpZD0iVmVjdG9yXzJfc3ViMyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDcuMTUxOCA5NS4xMTc3KSIgZD0iTTM2Ljg0' +
	'ODIgNS43NjQ3MUMzNi44NDgyIDUuNzY0NzEgMjkuNDM2NCAwIDExLjczMDUgMEM3LjMxODI1IDAgMy40NDU4MyAxLjEzNDgxIDAgMy4wOTI5OCIgcGF0aExl' +
	'bmd0aD0iMSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAuMDMwMyAx' +
	'Ii8+CjxwYXRoIGlkPSJWZWN0b3JfMl9zdWI0IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyOS4yMzUzIDUuNzkxZS0wNikiIGQ9Ik0wIDQyLjgyMzVDMi4xOTYw' +
	'OCA0MS44NjI3IDYuMTc2NDcgMzcuNDcwNiA2LjE3NjQ3IDI3LjU4ODJDNi4xNzY0NyAxNS4yMzUzIDEzLjU4ODIgMCAzMC44ODI0IDBDNDguMTc2NSAwIDUy' +
	'LjcwNTkgMTUuMjM1MyA1Mi43MDU5IDIxQzUyLjcwNTkgMjIuODU3MiA1My44ODA4IDIyLjQ3MzEgNTMuNTI5NCAyNS4xMTc2QzUzLjExOTYgMjguMjAxOSA1' +
	'MS40MDYyIDMzLjI2NzIgNDguNDIwOCAzNi43MjZDNDYuOTQzNyAzOC40MzcyIDQ1LjY4ODIgNDAuNTAxNiA0Ni4xNDI3IDQyLjcxNkM0Ni42MzA3IDQ1LjA5' +
	'MjkgNDcuMzUyOSA0Ny41OTMxIDQ3LjM1MjkgNTAuNjQ3MUM0Ny4zNTI5IDU2LjIxMzkgNDQuNjY1IDcyLjkxNjQgMjguOTA2NiA4Ny4xMDczQzI4LjA3MDMg' +
	'ODcuODYwNCAyOC4xNTU0IDg5LjI0NjkgMjguOTc0OCA5MC4wMTg0QzMxLjE3MjIgOTIuMDg3MSAzMy43NjQ3IDk1LjgyMDcgMzMuNzY0NyAxMDAuODgyQzMz' +
	'Ljc2NDcgMTA3LjQ3MSAyNy41ODgyIDEwNy40NzEgMjcuMTc2NSAxMDcuNDcxQzIwLjU4ODIgMTA3LjQ3MSAxNy45MTY1IDk4LjIxMDYgMTcuOTE2NSA5OC4y' +
	'MTA2IiBwYXRoTGVuZ3RoPSIxIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWRhc2hhcnJh' +
	'eT0iMC4yNjk1IDEiLz4KPHBhdGggaWQ9IlZlY3Rvcl8zX3N1YjUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcyLjQ3MDYgMjAuODc5MykiIGQ9Ik05LjQ3MDU5' +
	'IDAuMTIwNzA1QzYuMzEzNzMgLTAuMjkxMDYgMCAwLjEyMDcwNSAwIDUuMDYxODhDMCAxMC4wMDMxIDMuNDMxMzcgMTMuOTgzNSA1LjM1Mjk0IDE1LjM1NkM3' +
	'LjI1NTI5IDE2LjcxNDggMTIuNTIwNyAwLjg1NDYzNCA5LjU2Mjc1IDAuMTM3NzYiIHBhdGhMZW5ndGg9IjEiIHZpc2liaWxpdHk9ImhpZGRlbiIgc3Ryb2tl' +
	'PSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAgMSIvPgo8L2c+Cjwvc3ZnPgo=';

export const WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT = 150_000;

export type WorkbenchAppPreviewStartupPhase = 'starting' | 'installingDependencies' | 'serverStarting' | 'healthChecking' | 'opening' | 'slow' | 'failed' | 'missingDependencies' | 'setup' | 'emptyRepo';
export type WorkbenchAppPreviewStartupStageStatus = 'done' | 'current' | 'pending';
export type WorkbenchAppPreviewStartupAction = 'retry' | 'restart' | 'logs' | 'copy' | 'configure' | 'pasteRepoUrl' | 'openLocalFolder';

export interface IWorkbenchAppPreviewStartupStage {
	readonly label: string;
	readonly status: WorkbenchAppPreviewStartupStageStatus;
	readonly startedAt?: number;
}

export interface IWorkbenchAppPreviewStartupPageState {
	readonly phase: WorkbenchAppPreviewStartupPhase;
	readonly title: string;
	readonly message: string;
	readonly stages?: readonly IWorkbenchAppPreviewStartupStage[];
	readonly currentStageStartedAt?: number;
	readonly lastServerOutputAt?: number;
	readonly branchName?: string;
	readonly previousBranchName?: string;
	readonly repoPath?: string;
	readonly port?: number;
	readonly url?: string;
	readonly healthUrl?: string;
	readonly command?: string;
	readonly cwd?: string;
	readonly details?: readonly string[];
	readonly agentContext?: string;
	readonly actions?: readonly WorkbenchAppPreviewStartupAction[];
}

function escapeHtml(value: string | undefined): string {
	return (value ?? '').replace(/[&<>"']/g, ch => {
		switch (ch) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			case '\'': return '&#39;';
			default: return ch;
		}
	});
}

export function getWorkbenchAppPreviewStartupTitle(phase: WorkbenchAppPreviewStartupPhase, branchName: string | undefined): string {
	const subject = branchName?.trim() || 'this workspace';
	if (phase === 'slow') {
		return 'Preview is taking longer than expected';
	}
	if (phase === 'failed') {
		return 'Preview could not start';
	}
	if (phase === 'installingDependencies') {
		return `Installing dependencies for ${subject}`;
	}
	if (phase === 'missingDependencies') {
		return 'Preview dependencies need attention';
	}
	if (phase === 'setup') {
		return 'Preview needs configuration';
	}
	if (phase === 'emptyRepo') {
		return 'Add a repo to preview your app';
	}
	if (phase === 'opening') {
		return `Opening preview of ${subject}`;
	}
	return `Starting preview of ${subject}`;
}

export function createWorkbenchAppPreviewStartupDataUrl(state: IWorkbenchAppPreviewStartupPageState, startupAnimationSrc = ''): string {
	const details = state.details?.filter(Boolean) ?? [];
	const actions = new Set<WorkbenchAppPreviewStartupAction>();
	for (const action of state.actions ?? []) {
		if (action !== 'copy' || state.phase === 'slow') {
			actions.add(action);
		}
	}
	const agentContext = state.agentContext ?? '';
	const stages = state.stages ?? [];
	const showActivity = !!state.command && (state.phase === 'installingDependencies' || state.phase === 'serverStarting' || state.phase === 'healthChecking' || state.phase === 'slow' || state.phase === 'failed' || state.phase === 'missingDependencies');
	const detailRows = [
		state.branchName ? `Branch: ${state.branchName}` : undefined,
		state.previousBranchName && state.previousBranchName !== state.branchName ? `Previous branch: ${state.previousBranchName}` : undefined,
		state.port ? `Port: ${state.port}` : undefined,
		state.healthUrl ? `Health check: ${state.healthUrl}` : undefined,
		state.url ? `Preview URL: ${state.url}` : undefined,
		...details
	].filter((value): value is string => !!value);

	const actionButton = (action: WorkbenchAppPreviewStartupAction, label: string): string =>
		actions.has(action) ? `<button type="button" data-action="${action}">${escapeHtml(label)}</button>` : '';
	const stageIcon = (status: WorkbenchAppPreviewStartupStageStatus): string => status === 'done' ? '&#10003;' : status === 'current' ? '<span class="stage-spinner" aria-hidden="true"></span>' : '';
	const stageRows = stages.map(stage => `<li class="stage stage-${stage.status}">
		<span class="stage-icon">${stageIcon(stage.status)}</span>
		<span class="stage-label">${escapeHtml(stage.label)}</span>
		${stage.status === 'current' && stage.startedAt ? `<span class="stage-elapsed" data-started-at="${stage.startedAt}">0s</span>` : ''}
	</li>`).join('');

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${escapeHtml(state.title)}</title>
<style>
	:root { color-scheme: dark; --app-preview-accent: #0000ff; --app-preview-accent-hover: #0000d6; --app-preview-background: #1e1e1e; --app-preview-foreground: #f3f3f3; --app-preview-muted: rgba(243, 243, 243, 0.68); --app-preview-subtle: rgba(243, 243, 243, 0.5); --app-preview-border: rgba(243, 243, 243, 0.18); font-family: "IBM Plex Mono", monospace; font-size: 13px; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--app-preview-background); color: var(--app-preview-foreground); font-family: inherit; font-size: 13px; }
	main { width: min(560px, calc(100vw - 48px)); display: grid; gap: 18px; }
	.status { display: flex; align-items: center; gap: 14px; }
	.startup-animation-frame { width: 54px; height: 76px; display: grid; place-items: center; flex: 0 0 auto; overflow: visible; }
	.startup-animation { width: 54px; height: 76px; object-fit: contain; overflow: visible; display: block; }
	.icon { width: 24px; height: 24px; display: grid; place-items: center; border: 1px solid var(--app-preview-accent); border-radius: 50%; color: var(--app-preview-accent); font-size: 14px; font-weight: 600; }
	h1 { margin: 0; font-size: 20px; font-weight: 600; line-height: 26px; letter-spacing: 0; }
	p { margin: 0; line-height: 1.45; color: var(--app-preview-muted); }
	.stages { margin: 2px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
	.stage { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px; color: var(--app-preview-subtle); }
	.stage-current { color: var(--app-preview-foreground); font-weight: 600; }
	.stage-current .stage-icon { color: var(--app-preview-accent); }
	.stage-done { color: var(--app-preview-muted); }
	.stage-done .stage-icon { color: var(--app-preview-accent); }
	.stage-pending { color: var(--app-preview-subtle); }
	.stage-icon { width: 20px; min-height: 18px; display: grid; place-items: center; text-align: center; font-size: 13px; }
	.stage-spinner { width: 8px; height: 8px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; box-sizing: border-box; animation: app-preview-stage-spinner 900ms linear infinite; }
	@keyframes app-preview-stage-spinner { to { transform: rotate(360deg); } }
	.stage-label { overflow-wrap: anywhere; }
	.stage-elapsed { font-weight: 500; color: var(--app-preview-muted); font-variant-numeric: tabular-nums; }
	.activity { min-height: 18px; font-size: 12px; color: var(--app-preview-muted); }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	button { appearance: none; border: 0; border-radius: 4px; background: var(--app-preview-accent); color: #ffffff; padding: 6px 10px; font: inherit; font-size: 13px; font-weight: 500; line-height: 18px; cursor: pointer; }
	button:hover { background: var(--app-preview-accent-hover); }
	button:focus-visible { outline: 1px solid var(--app-preview-accent); outline-offset: 2px; }
	.copied { min-height: 18px; font-size: 12px; color: var(--app-preview-muted); white-space: pre-wrap; }
	.more-info { margin-top: 8px; font-size: 12px; color: var(--app-preview-subtle); }
	.more-info > summary { cursor: pointer; width: fit-content; list-style: none; }
	.more-info > summary::-webkit-details-marker { display: none; }
	.more-info > summary:hover { color: var(--app-preview-accent); }
	.caption { margin-top: 8px; color: var(--app-preview-subtle); font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
	<section class="status">
		${state.phase === 'emptyRepo' ? '<div class="icon">+</div>' : state.phase === 'slow' || state.phase === 'failed' || state.phase === 'missingDependencies' ? '<div class="icon">!</div>' : `<span class="startup-animation-frame"><img class="startup-animation" src="${escapeHtml(startupAnimationSrc)}" alt="" aria-hidden="true"></span>`}
		<div>
			<h1>${escapeHtml(state.title)}</h1>
			<p>${escapeHtml(state.message)}</p>
		</div>
	</section>
	${stages.length ? `<ol class="stages">${stageRows}</ol>` : ''}
	${showActivity ? `<div class="activity" data-last-output-at="${state.lastServerOutputAt ?? ''}" aria-live="polite"></div>` : ''}
	${actions.size ? `<section class="actions">
		${actionButton('retry', 'Retry')}
		${actionButton('restart', 'Restart preview server')}
		${actionButton('logs', 'Show terminal logs')}
		${actionButton('copy', 'Copy context for agent')}
		${actionButton('configure', 'Configure URL')}
		${actionButton('pasteRepoUrl', 'Paste repo URL')}
		${actionButton('openLocalFolder', 'Open local folder')}
	</section>` : ''}
	<div class="copied" aria-live="polite"></div>
	${detailRows.length ? `<details class="more-info"><summary>Show more info</summary><p class="caption">${escapeHtml(detailRows.join('\n'))}</p></details>` : ''}
</main>
<script>
	const agentContext = ${JSON.stringify(agentContext)};
	const formatElapsed = (startedAt) => {
		const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
		return elapsed < 60 ? elapsed + 's' : Math.floor(elapsed / 60) + 'm ' + String(elapsed % 60).padStart(2, '0') + 's';
	};
	const updateTimers = () => {
		for (const element of document.querySelectorAll('.stage-elapsed[data-started-at]')) {
			const startedAt = Number(element.getAttribute('data-started-at'));
			if (Number.isFinite(startedAt) && startedAt > 0) {
				element.textContent = formatElapsed(startedAt);
			}
		}
		const activity = document.querySelector('.activity[data-last-output-at]');
		const lastOutputAt = Number(activity?.getAttribute('data-last-output-at'));
		if (activity && Number.isFinite(lastOutputAt) && lastOutputAt > 0) {
			activity.textContent = 'Last server output ' + formatElapsed(lastOutputAt) + ' ago';
		} else if (activity) {
			activity.textContent = 'Waiting for server output...';
		}
	};
	updateTimers();
	setInterval(updateTimers, 1000);
	for (const button of document.querySelectorAll('button[data-action]')) {
		button.addEventListener('click', async () => {
			const action = button.getAttribute('data-action');
			if (action === 'copy') {
				document.querySelector('.copied').textContent = 'Copying context for agent...';
				location.href = 'about:blank#app-preview-action=copy&nonce=' + Date.now();
				return;
			}
			location.href = 'about:blank#app-preview-action=' + encodeURIComponent(action ?? '') + '&nonce=' + Date.now();
		});
	}
</script>
</body>
</html>`;

	return `data:text/html;base64,${encodeBase64(VSBuffer.fromString(html))}`;
}
