ServerlessDB = function() {
	this.collections = [];

	this.onSendMessage = null;
}

ServerlessDB.prototype.onMessage = function(data) {
	if(!data) {
		return;
	}

	for(var i = 0; i < this.collections.length; i++) {
		if(data.toId == this.collections[i].id || (!data.toId && data.name == this.collections[i].name)) {
			this.collections[i].onMessage(data.fromId, data);
		}
	}			
}

ServerlessDB.prototype.addCollection = function(collection) {
	this.collections.push(collection);
}

ServerlessDB.prototype.removeCollection = function(collection) {
	for(var i = this.collections.length - 1; i >= 0; i--)
		if(this.collections[i] == collection)
			this.collections.splice(i, 1);
}

ServerlessDB.prototype.isConnected = function(id) {
	for(var i = 0; i < this.collections.length; i++) {
		if(this.collections[i].id == id) {
			return true;
		}
	}
	return false;	
}

ServerlessDB.prototype.sendMessage = function(name, fromId, toId, data) {
	if(!this.isConnected(fromId)) {
		return;
	}
	data.name = name;
	data.fromId = fromId;
	data.toId = toId;

	if(this.onSendMessage) this.onSendMessage(data);
}

ServerlessDB.prototype.sendMessageToAll = function(name, fromId, data) {
	if(!this.isConnected(fromId)) {
		return;
	}
	data.name = name;
	data.fromId = fromId;

	if(this.onSendMessage) this.onSendMessage(data);
}


ServerlessCollection = function(db, name) {
	this.db = db;
	this.name = name;
	this.id = Math.random().toString(36).slice(2);
	this.data = [];
	this.trash = [];
	this.events = [];

	this.onConnect = null;
	this.onDisconnect = null;
	this.onDataChanged = null;

	this.load();
}

ServerlessCollection.prototype.connect = function() {
	this.db.addCollection(this);

	if(this.onConnect) this.onConnect();
	if(this.onDataChanged) this.onDataChanged();

	this.sendMessageToAll({
		type: "newbie",
		data: this.events
	})
}

ServerlessCollection.prototype.disconnect = function() {
	this.db.removeCollection(this);
	if(this.onDisconnect) this.onDisconnect();
}

ServerlessCollection.prototype.load = function() {
	var value = JSON.parse(window.localStorage.getItem("serverless_" + this.name));
	if(!value) return;

	this.data = value.data;
	this.trash = value.trash;
	this.events = value.events;

	if(this.onDataChanged) this.onDataChanged();
}

ServerlessCollection.prototype.save = function() {
	var value = {};
	value.data = this.data;
	value.trash = this.trash;
	value.events = this.events;
	window.localStorage.setItem("serverless_" + this.name, JSON.stringify(value));
}

ServerlessCollection.prototype.sendMessageToAll = function(message) {
	this.db.sendMessageToAll(this.name, this.id, message);
}

ServerlessCollection.prototype.sendMessage = function(toPeerId, message) {
	this.db.sendMessage(this.name, this.id, toPeerId, message);
}

ServerlessCollection.prototype.onMessage = function(senderId, message) {
	if(message.type == "insert") {
		this.remoteInsert(message.data);
		if(this.onDataChanged) this.onDataChanged();
		this.save();
	}

	if(message.type == "update") {
		this.remoteUpdate(message.data);
		if(this.onDataChanged) this.onDataChanged();
		this.save();
	}

	if(message.type == "upsert") {
		this.remoteUpsert(message.data);
		if(this.onDataChanged) this.onDataChanged();
		this.save();
	}

	if(message.type == "remove") {
		this.remoteRemove(message.data);
		if(this.onDataChanged) this.onDataChanged();
		this.save();
	}

	if(message.type == "newbie") {
		// extract events that newbie doesn't have and send sync_response to him
		var syncEvents = this.events.filter(function(elem) { return message.data.indexOf(elem) < 0; });

		var syncData = {};
		syncData.upsertData = this.data.filter(function(elem) { return syncEvents.indexOf(elem._time) >= 0; });
		syncData.trashData = this.trash.filter(function(elem) { return syncEvents.indexOf(elem._time) >= 0; });

		this.sendMessage(senderId, {
			type: "sync_response",
			data: syncData
		});

		// extract events that I don't have and send to newbie as sync_request
		var me = this;
		var requestEvents = message.data.filter(function(elem) { return me.events.indexOf(elem) < 0; });

		this.sendMessage(senderId, {
			type: "sync_request",
			data: requestEvents
		});
	}

	if(message.type == "sync_response") {
		for(var i = 0; i < message.data.upsertData.length; i++) {
			this.remoteUpsert(message.data.upsertData[i]);
		}

		for(var i = 0; i < message.data.trashData.length; i++) {
			this.remoteRemove(message.data.trashData[i]);
		}

		if(this.onDataChanged) this.onDataChanged();
		this.save();
	}

	if(message.type == "sync_request") {

		var syncData = {};
		syncData.upsertData = this.data.filter(function(elem) { return message.data.indexOf(elem._time) >= 0; });
		syncData.trashData = this.trash.filter(function(elem) { return message.data.indexOf(elem._time) >= 0; });

		this.sendMessage(senderId, {
			type: "sync_response",
			data: syncData
		});
	}
}

ServerlessCollection.prototype.insert = function(doc) {
	doc._id = Math.random().toString(36).slice(2);
	doc._time = new Date().getTime();

	this.data.push(doc);
	this.events.push(doc._time);

	if(this.onDataChanged) this.onDataChanged();

	this.sendMessageToAll({
		type: "insert",
		data: doc
	});

	this.save();

	return doc._id;
}

ServerlessCollection.prototype.update = function(id, doc) {
	doc._id = id;
	doc._time = new Date().getTime();

	for(var i = 0; i < this.data.length; i++) {
		if(this.data[i]._id == id) {
			this.data[i] = doc;
		}					
	}
	this.events.push(doc._time);

	if(this.onDataChanged) this.onDataChanged();

	this.sendMessageToAll({
		type: "update",
		data: doc
	});

	this.save();
}

ServerlessCollection.prototype.remove = function(id) {
	var trashData = {
		_id: id,
		_time: new Date().getTime()
	}

	this.trash.push(trashData);

	for(var i = this.data.length - 1; i >= 0; i--) {
		if(this.data[i]._id == trashData._id) {
			this.data.splice(i, 1);
		}
	}
	this.events.push(trashData._time);

	if(this.onDataChanged) this.onDataChanged();

	this.sendMessageToAll({
		type: "remove",
		data: trashData
	});

	this.save();
}

ServerlessCollection.prototype.isDeleted = function(id) {
	for(var i = 0; i < this.trash.length; i++) {
		if(this.trash[i]._id == id) {
			return true;
		}
	}
	return false;
}

ServerlessCollection.prototype.remoteInsert = function(doc) {
	if(this.isDeleted(doc._id)) {
		return;
	}
	this.data.push(doc);
	this.events.push(doc._time);
	return doc._id;
}

ServerlessCollection.prototype.remoteUpdate = function(doc) {
	if(this.isDeleted(doc._id)) {
		return;
	}
	for(var i = 0; i < this.data.length; i++) {
		if(this.data[i]._id == doc._id) {
			this.data[i] = doc;
		}					
	}
	this.events.push(doc._time);
}

ServerlessCollection.prototype.remoteUpsert = function(doc) {
	if(this.isDeleted(doc._id)) {
		return;
	}
	var found = false;
	for(var i = 0; i < this.data.length; i++) {
		if(this.data[i]._id == doc._id) {
			this.data[i] = doc;
			found = true;
		}
	}

	if(!found) {
		this.data.push(doc);
	}
	this.events.push(doc._time);
	return doc._id;
}

ServerlessCollection.prototype.remoteRemove = function(trashData) {
	this.trash.push(trashData);

	for(var i = this.data.length - 1; i >= 0; i--) {
		if(this.data[i]._id == trashData._id) {
			this.data.splice(i, 1);
		}
	}
	this.events.push(trashData._time);
}
