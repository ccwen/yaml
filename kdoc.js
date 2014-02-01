/*
  Multiversion text with external durable markups
*/
var createMarkup=function(textlen,start,len,payload) {
	if (textlen==-1) textlen=1024*1024*1024; //max string size 1GB
	//the only function create a new markup instance, be friendly to V8 Hidden Class

	if (len<0) len=textlen;
	if (start<0) start=0;
	if (start>textlen) start=textlen;
	if (start+len>textlen) {
		len-=start+len-textlen;
		if (len<0) len=0;
	}

	return {start:start,len:len,payload:payload};
}
var cloneMarkup=function(m) {
	if (typeof m=='undefined') return null;
	return createMarkup(-1,m.start,m.len,JSON.parse(JSON.stringify(m.payload)));
}
var migrateMarkup=function(markup, rev) {
	var end=markup.start+markup.len;
	var newlen=(rev.payload.text.length-rev.len);
	var revend=rev.start+rev.len;
	var m=cloneMarkup(markup); //return a new copy

	if (end<=rev.start) return m;
	else if (revend<=markup.start) {
		m.start+=newlen;
		return m;
	} else { //overlap
		//  markup    x    xx      xx    xyz      xyyyz        xyz  
		//  delete   ---   ---    ---     ---      ---        ---     
		//  dout     |     |      |		   x        xz          z            
		//  insert   +++   +++    +++     +++      +++        +++
		//  iout     +++x  +++xx  +++xx  x+++yz   x+++yyyz    +++ xyz
		if (rev.start>markup.start) {
			adv=rev.start-markup.start;  //markup in advance of rev
			var remain=( markup.len -adv) + newlen ; // remaining character after 
			if (remain<0) remain=0;
			m.len = adv + remain ;
		} else {
			m.start=rev.start;
			behind=markup.start-rev.start;
			m.len=markup.len - (rev.len-behind);
		}
		if (m.len<0) m.len=0;
		return m;
	}
}
var upgradeText=function(sourcetext ,revisions) {
	revisions.sort(function(r1,r2){return r2.start-r1.start});
	var text2=sourcetext;
	revisions.map(function(r){
		text2=text2.substring(0,r.start)+r.payload.text+text2.substring(r.start+r.len);
	});
	return text2;
}
var addMarkup=function(start,len,payload) {
	this.__getMarkups__().push(createMarkup(this.getInscription().length,start, len, payload ));
}
var addRevision=function(start,len,str) {
	var valid=this.__getRevisions__().every(function(r) {
		return (r.start+r.len<=start || r.start>=start+len);
	})
	var newrevision=createMarkup(this.getInscription().length,start,len,{text:str});
	if (valid) this.__getRevisions__().push(newrevision);
	return valid;
}
var addMarkups=function(newmarkups,opts) {
	if (!(newmarkups instanceof Array)) return;
	if (opts &&opts.clear) this.clearMarkups();
	var maxlength=this.getInscription().length;
	var markups=this.__getMarkups__();
	for (var i in newmarkups) {
		m=newmarkups[i];
		var newmarkup=createMarkup(maxlength, m.start, m.len, m.payload)
		markups.push(newmarkup);
	};
}
var addRevisions=function(newrevisions,opts) {
	if (!(newrevisions instanceof Array)) return;
	if (opts &&opts.clear) this.clearRevisions();
	var revisions=this.__getRevisions__();
	var maxlength=this.getInscription().length;
	for (var i in newrevisions) {
		var m=newrevisions[i];
		var newrevision=createMarkup(maxlength, m.start, m.len, m.payload );
		revisions.push(newrevision);	
	}
}	
var downgradeMarkups=function(markups) {
	var downgraded=[];
	for (var i in markups) {
		var m=markups[i];
		this.getRevert().map(function(rev){
			m=migrateMarkup(m,rev);
		});
		downgraded.push(m);
	}
	return downgraded;
}
var upgradeMarkups=function(markups,revs) {
	var migratedmarkups=[];
	markups.map(function(m){
		revs.map(function(revs){
			m=migrateMarkup(m,revs);
		});
		migratedmarkups.push(m);
	})
	return migratedmarkups;
}

var upgradeMarkupsTo=function(M,targetPage) {
	var pg=targetPage, lineage=[], doc=this.getDoc();
	while (true) {
			var pid=pg.getParentId();
			if (!pid) break; // root	
			if (pid==pg.getId())break;
			lineage.unshift(pg);
			pg=doc.getPage(pid);
	}
	lineage.map(function(pg){
		var parentPage=doc.getPage(pg.getParentId());
		var rev=revertRevision(pg.getRevert(),parentPage.getInscription());
		M=parentPage.upgradeMarkups(M,rev);
	})
	return M;
}

var downgradeMarkupsTo=function(M,targetPage) {
	var pg=this,doc=this.getDoc();
	var ancestorId=targetPage.getId();
	while (true) {
			var pid=pg.getParentId();
			if (!pid) break; // root	
			M=pg.downgradeMarkups(M);
			if (pid==ancestorId)break;
			pg=doc.getPage(pid);
	}
	return M;
}

var hasAncestor=function(ancestor) {
	var ancestorId=ancestor.getId();
	var pg=this,doc=this.getDoc();
	
	while (true) {
		if (!pg.getParentId()) return false; // root	
		if (pg.getParentId()==ancestorId) return true;
		pg=doc.getPage(pg.getParentId());
	}
	return false;
}
var getAncestors=function() {
	var pg=this,ancestor=[], doc=this.getDoc();
	while (true) {
			var pid=pg.getParentId();
			if (!pid) break; // root	
			pg=doc.getPage(pid);
			ancestor.unshift(pg);
	}
	return ancestor;
}

var clear=function(M,start,len) { //return number of item removed
	var count=0;
	if (typeof start=='undefined') {
		count=M.length;
	  M.splice(0, M.length);
	  return count;
	}
	if (len<0) len=this.getInscription().length;
	var end=start+len;
	for (var i=M.length-1;i>=0;--i) {
		if (M[i].start>=start && M[i].start+M[i].len<=end) {
			M.splice(i,1);
			count++;
		}
	}
	return count;
}
var clearRevisions=function(start,len) {
	clear.apply(this,[this.__getRevisions__(),start,len]);
}
var clearMarkups=function(start,len) {
	clear.apply(this,[this.__getMarkups__(),start,len]);
}
var getChildren=function() {
	var id=this.getId(), doc=this.getDoc();
	var pgcount=doc.getPageCount();
	var children=[];
	for (var i=0;i<pgcount;i++) {
		if (doc.getPage(i).getParentId()==id) children.push(i);
	}
	return children;
}
var isLeafPage=function() {
	var id=this.getId(), doc=this.getDoc();
	var pgcount=doc.getPageCount();
	for (var i=0;i<pgcount;i++) {
		if (doc.getPage(i).getParentId()==id) return false;
	}
	return true;
}
var revertRevision=function(revs,parentinscription) {
	var revert=[], offset=0;
	revs.sort(function(m1,m2){return m1.start-m2.start});
	revs.map(function(r){
		var newinscription="";
		var	m=cloneMarkup(r);
		var newtext=parentinscription.substr(r.start,r.len);
		m.start+=offset;
		m.len=m.payload.text.length;
		m.payload.text=newtext;
		offset+=m.len-newtext.length;
		revert.push(m);
	})
	revert.sort(function(a,b){return b.start-a.start});
	return revert;
}
var markupAt=function(pos) {
	return this.__getMarkups__().filter(function(m){
		var len=m.len;if (!m.len) len=1;
		return (pos>=m.start && pos<m.start+len);
	})
}
var revisionAt=function(pos) {
	return this.__getRevisions__().filter(function(m){
		return (pos>=m.start && pos<=m.start+m.len);
	})
}

var newPage = function(opts) {
	var PG={}; // the instance
	var inscription="";
	var markups=[];
	var revisions=[];

	opts=opts||{};
	opts.id=opts.id || 0; //root id==0
	var parentId=0;
	if (typeof opts.parent==='object') {
		inscription=opts.parent.getInscription();
		parentId=opts.parent.getId();
	}
	var doc=opts.doc;
	var meta= {name:"",id:opts.id, parentId:parentId, revert:null };

	//this is the only function changing inscription,use by Doc only
	PG.__selfEvolve__  =function(revs,M) { 
		var newinscription=upgradeText(inscription, revs);
		var migratedmarkups=[];
		meta.revert=revertRevision(revs,inscription);
		inscription=newinscription;
		markups=upgradeMarkups(M,revs);
	}
	//protected functions
	PG.__getMarkups__  = function() { return markups; }	
	PG.__getRevisions__= function() { return revisions;	}
	PG.hasRevision     = function() { return revisions.length>0}
	PG.getId           = function() { return meta.id;	}
	PG.getDoc          = function() { return doc;	}
	PG.getParentId     = function() { return meta.parentId;	}
	PG.getMarkup       = function(i){ return cloneMarkup(markups[i])} //protect from modification
	PG.getMarkupCount  = function() { return markups.length}
	PG.getRevert       = function() { return meta.revert	}
	PG.getRevision     = function(i){ return cloneMarkup(revisions[i])}
	PG.getRevisionCount= function() { return revisions.length}
	PG.getInscription  = function() { return inscription;	}
	PG.setName         = function(n){ meta.name=n; return this}
	PG.getName         = function(n){ return meta.name}
	PG.clearRevisions  = clearRevisions;
	PG.clearMarkups    = clearMarkups;
	PG.addMarkup       = addMarkup;
	PG.addMarkups      = addMarkups;
	PG.addRevision     = addRevision;
	PG.addRevisions    = addRevisions;
	PG.hasAncestor     = hasAncestor;
	PG.upgradeMarkups  = upgradeMarkups;
	PG.downgradeMarkups= downgradeMarkups;
	PG.upgradeMarkupsTo= upgradeMarkupsTo;
	PG.downgradeMarkupsTo=downgradeMarkupsTo;
	PG.getAncestors    = getAncestors;
	PG.isLeafPage      = isLeafPage;
	PG.markupAt        = markupAt;
	PG.revisionAt      = revisionAt;
	PG.getChildren     = getChildren;


	return PG;
}

var createDocument = function() {
	var DOC={};
	var pages={};
	var pagecount=0;

	var createFromJSON=function(json) {
			rootPage.clearRevisions();
			rootPage.addRevision(0,0,json.text);
			var page=evolvePage(rootPage);
			page.setName(json.name);
			page.addMarkups(json.markups,true);
			page.addRevisions(json.revisions,true);
			return page;
	}
	var createPages=function(json) {
		json.map(function(pg){
			createPage(pg);
		})
		return this;
	}
	var createPage=function(input) {
		var id=pagecount;
		if (typeof input=='undefined' || typeof input.getId=='function') {
			var parent=input||0;
			var page=newPage({id:id,parent:parent,doc:DOC});
			pagecount++;
		} else if (typeof input=='string') { 
			var page=createFromJSON({text:input});
		} else {
			var page=createFromJSON(input);
		}
		pages[id] = page ;
		return page;
	}

	var rootPage=createPage();   

	var evolvePage=function(d,opts) {//apply revisions and upgrate markup
		if (opts && opts.preview) {
			var nextgen=newPage({parent:d,doc:DOC});
		} else {
			var nextgen=createPage(d);	
		}
		nextgen.__selfEvolve__( d.__getRevisions__() , d.__getMarkups__() );
		return nextgen;
	}

	var findMRCA=function(pg1,pg2) {
		var ancestors1=pg1.getAncestors();
		var ancestors2=pg2.getAncestors();
		var common=0; //rootPage id
		while (ancestors1.length && ancestors2.length
			  && ancestors1[0].getId()==ancestors2[0].getId()) {
			common=ancestors1[0];
			ancestors1.shift();ancestors2.shift();
		}
		return common;
	}

	var migrate=function(from,to) { //migrate markups of A to B
		if (typeof from=='number') from=this.getPage(from);
		var M=from.__getMarkups__();
		var out=null;
		if (typeof to=='undefined') {
			out=from.downgradeMarkups(M);
		} else {
			if (typeof to=='number') to=this.getPage(to);
			if (from.getId()===to.getId()) {
				return M;
			} else if (to.hasAncestor(from)) {
				out=from.upgradeMarkupsTo(M,to);
			} else if (from.hasAncestor(to)){
				out=from.downgradeMarkupsTo(M,to);
			} else {
				var ancestor=findMRCA(from,to);
				out=from.downgradeMarkupsTo(M,ancestor);
				out=ancestor.upgradeMarkupsTo(out,to);
			}
		}
		return out;
	}
	var findPage=function(name) {
		for (var i=0;i<this.getPageCount();i++) {
			if (name===pages[i].getName()) return pages[i];
		}
		return null;
	}
	var getLeafPages=function() {
		var arr=[];
		for (var i=0;i<this.getPageCount();i++) {arr[i]=true;}
		for (var i=0;i<this.getPageCount();i++) {
			var pid=pages[i].getParentId();
			arr[pid]=false;
		}
		var leafpages=[];
		arr.map(function(p,i){ if (p) leafpages.push(i) });
		return leafpages;
	}

	DOC.getPage=function(id) {return pages[id]};
	DOC.getPageCount=function() {return pagecount} ;
	DOC.createPage=createPage;
	DOC.createPages=createPages;
	DOC.evolvePage=evolvePage;
	DOC.findMRCA=findMRCA;
	DOC.migrate=migrate; 
	DOC.downgrade=migrate; //downgrade to parent
	DOC.migrateMarkup=migrateMarkup; //for testing
	DOC.getLeafPages=getLeafPages;
	DOC.findPage=findPage;

	return DOC;
}

module.exports={ createDocument: createDocument }