class ApiResponse {
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }

  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

class OkResponse extends ApiResponse {
  constructor(data, message = 'Success') {
    super(200, data, message);
  }
}

class CreatedResponse extends ApiResponse {
  constructor(data, message = 'Created') {
    super(201, data, message);
  }
}

class AcceptedResponse extends ApiResponse {
  constructor(data, message = 'Accepted') {
    super(202, data, message);
  }
}

class NoContentResponse extends ApiResponse {
  constructor(message = 'No Content') {
    super(204, null, message);
  }
}

export { ApiResponse, OkResponse, CreatedResponse, AcceptedResponse, NoContentResponse };
