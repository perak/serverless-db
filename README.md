Serverless Database
===================

I am just playing around... 

Trying to make simple database which operates without server - data is stored client side and is synchronised between clients.
Also works if client is offline - data is synchronized with other clients once client comes online.

Data is stored in AppCache so it is not lost if client closes browser or refreshes page. Also works in multiple tabs.

How to run example
------------------

Example uses socket.io for message transport between clients:

	npm install socket.io

To run example:

	node sock.js

And navigate browser to:

	http://localhost:8888

Usage
-----

There are two classes: ServerlessDB and ServerlessCollection.

**ServerlessDB** is to provide messaging between clients. I am using socket.io in example but any protocol can be used (WebRTC?) - just write your own `onSendMessage` method, and code which calls `onMessage` (see index.html).

**ServerlessCollection** have `insert`, `update` and `remove` methods for manipulating with data. Synchronisation between clients is performed automatically.



Project status
--------------

Super-early stage :)
