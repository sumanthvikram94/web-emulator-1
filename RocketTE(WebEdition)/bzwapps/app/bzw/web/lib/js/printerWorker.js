window = this;
document = { createElementNS: function () { return {}; } };


// Substitute with the path to your pdfmake and vfs_fonts script
importScripts('pdfmake.min.js');


onmessage = function(req) {
  new Promise(function (resolve, reject) {
    try{
      generatePdfBlob(req.data, function (result) {
        if (result) { resolve(result); } else { reject(); }
      });
    }catch(e){
      reject();
      // postMessage({status:false,message:err.message});
      // console.log(err);
    }
  }).then(function (pdfBlob) {
	  let message={status:true,pdfBlob:pdfBlob,fileName:req.data.fileName,printerId:req.data.printerId}
    postMessage(message);
  }).catch((err) => {
    postMessage({status:false,message:err.message});
    console.log(err);
  });
};


function generatePdfBlob(myData, callback) {
  if (!callback) {
    throw new Error('generatePdfBlob is an async method and needs a callback');
  }
  const docDefinition = generateDocDefinition(myData.content);
  pdfMake.fonts = myData.fonts
  pdfMake.createPdf(docDefinition).getBlob(callback);
}


function generateDocDefinition(myData) {
  return myData;
}


