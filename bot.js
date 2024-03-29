var needle = require('needle');

var config = {};
config.username = null;
config.password = null;

var edittoken = null;
var API_LINK = 'https://community.fandom.com/api.php';

var options = {
  user_agent: 'tynodemw/0.0.0; Message @tya on slack for issues/concerns',
  cookies: {},
  headers: { "X-Wikia-WikiaAppsID": "TyA", // Bypass Missing pow counter headers
             "X-Fandom-Auth": "1"
          }
};

function setUserInfo(username, password) {
  config.username = username;
  config.password = password;
}

function logIn(force=false) {
  return new Promise(function(resolve, reject) {
    if(!force) {
      if(typeof options.cookies.fandom_session != 'undefined') {
        console.log("should already be logged in.");
        resolve(true);
        return;
      }
    }

    edittoken = null; // reset edit token because we've logged out

    needle('post', 'https://services.fandom.com/mobile-fandom-app/fandom-auth/login',
          { // form data
            username: config.username,
            password: config.password
          },
          options
        ).then(function(response) {

          if(typeof response.cookies.fandom_session == 'undefined') {
            console.log("failed to get session");
            reject(false)

          } else {
            options.cookies = {
              fandom_session: response.cookies.fandom_session,
              access_token: response.cookies.fandom_session
              };
            resolve(true);
          }
        })
      .catch(function(err) {
        reject(err);
      });
    });
  };

  function getEditToken() {
    return new Promise(function(resolve, reject) {
      needle('post', API_LINK,
        {
          action: 'query',
          meta: 'tokens',
          format: 'json',
          type: 'csrf'
        },
        options
      ).then(function(resp) {
        if(resp.body.query.tokens.csrftoken != null) {
          resolve(resp.body.query.tokens.csrftoken);
        } else {
          reject(false);
        }
      }).catch(function(err) {
        reject(err)
      });
    });
  }

  function getPageContent(page) {
    return new Promise(function(resolve, reject) {
      needle('get', API_LINK,
        {
          action:'query',
          prop: 'revisions',
          titles: page,
          rvslots: 'main',
          rvprop: 'content',
          format: 'json'
        },
        options
      ).then(function(resp) {
        for(var p in resp.body.query.pages) {
          if(typeof resp.body.query.pages[p].revisions == "undefined") {
            resolve(""); // If page doesn't exist, return no content
          } else {
            resolve(resp.body.query.pages[p].revisions[0].slots.main['*']);
          }
        }
      }).catch(function(err) {
        console.log("unable to get page content");
        reject(err);
      })
    });
  }

  function checkEditToken() {
    return new Promise(function(resolve, reject) {
      if(edittoken == null) {
        getEditToken().then(function(token) {
          edittoken = token;
          resolve(true);
        }).catch(function(err) {
          console.log("unable to get edit token");
          reject(err);
        });
      } else {
        resolve(true);
      }
    })
  }

  function edit(title, content, summary, maxtries=3) {
    return new Promise(function(resolve, reject) {
      if(maxtries <= 0)
        resolve(false);

      checkEditToken().then(function(res) {
        if(res) {
          needle('post', API_LINK,
            {// form fields
              action:"edit",
              title: title,
              text: content,
              summary: summary,
              format:"json",
              bot: true,
              token: edittoken,
              assert: 'user'
            },
          options
        ).then(function(resp) {
              if(typeof resp.body.error == 'undefined') {
                resolve(resp.body);
              } else {
                if(resp.body.error.code == "assertuserfailed") {
                  logIn(force=true)
                    .then(function(resp) {
                      edit(title, content, summary, maxtries-1)
                        .then(function(resp) {
                          resolve(resp);
                        })
                        .catch(function(err) {
                          console.log("err");
                          reject(err);
                        });
                      })
                      .catch(function(err) {
                        // error with login
                        console.log("errr2");
                        reject(err);
                      });
                      return;
                } else if(resp.body.error.code == "badtoken") {
                  // our token has expired.
                  // we check our edit token when calling edit, so
                  //    deciding to reiterate should fix the issue automagically
                  //    assuming we still have retry attempts left.
                  edittoken = null;

                  edit(title, content, summary, maxtries-1)
                    .then(function(resp) {
                      resolve(resp);
                    })
                    .catch(function(err) {
                      console.log("err");
                      reject(err);
                    });
                }

                // body.error is defined, so maybe read what the error is.
                console.log("errrr3");
                reject(resp.body);
              }
            }).catch(function(err) {
              // error with edit request
              reject(err);
            });
        } else {
          reject(true);
        }
      }).catch(function(err) {
        reject(err);
      })
    }
  );
  }

  function setApiLink(url) {
    API_LINK = url;
  }

exports.getPageContent = getPageContent;
exports.setApiLink = setApiLink;
exports.logIn = logIn;
exports.edit = edit;
exports.setUserInfo = setUserInfo;
